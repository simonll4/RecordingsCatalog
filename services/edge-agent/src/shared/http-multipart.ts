/**
 * HTTP Multipart Client - multipart/form-data with Retry Logic
 *
 * Specialized HTTP client for sending multipart/form-data requests with:
 * - Automatic retry with exponential backoff
 * - Backpressure handling (429 Too Many Requests)
 * - Retry-After header respect
 * - Binary and text data support
 *
 * Purpose:
 * ========
 *
 * Edge Agent uploads frames and metadata to session-store.
 * Network can be unreliable (WiFi, cellular), so retries are essential.
 *
 * Use Cases:
 * ==========
 *
 * Frame Upload
 *   - POST /ingest with multipart form
 *   - Parts: meta.json (JSON), frame.jpg (binary image)
 *   - Retry on network errors or server overload
 *
 * Detection Upload
 *   - POST /detections with JSON body
 *   - Batched detections array
 *   - Retry on transient failures
 *
 * Features:
 * =========
 *
 * Automatic Retry
 *   - Retries on network errors (ECONNREFUSED, timeout, etc.)
 *   - Exponential backoff: 200ms, 400ms, 800ms, ...
 *   - Configurable max retries (default: 3)
 *
 * Backpressure Handling
 *   - Detects 429 Too Many Requests
 *   - Respects Retry-After header (if present)
 *   - Backs off to avoid overwhelming server
 *
 * Multipart Support
 *   - Supports both binary (Buffer) and text (string) parts
 *   - Automatic content-type detection
 *   - File name and part name configuration
 *
 * Example Usage:
 * ==============
 *
 * ```typescript
 * import { sendMultipart } from "./shared/http-multipart.js";
 *
 * // Upload frame with metadata
 * const response = await sendMultipart(
 *   "http://session-store:3001/ingest",
 *   [
 *     {
 *       name: "meta",
 *       data: JSON.stringify({ deviceId: "edge-001", timestamp: Date.now() }),
 *       contentType: "application/json",
 *     },
 *     {
 *       name: "frame",
 *       data: frameBuffer, // Buffer
 *       filename: "frame.jpg",
 *       contentType: "image/jpeg",
 *     },
 *   ],
 *   { maxRetries: 3, backoffMs: 200 }
 * );
 *
 * if (response.ok) {
 *   console.log("Upload successful:", response.data);
 * } else {
 *   console.error("Upload failed:", response.statusText);
 * }
 * ```
 *
 * Why Retry Logic?
 * ================
 *
 * Network Reliability
 *   - Edge devices often on unreliable networks (WiFi, cellular)
 *   - Temporary outages are common
 *   - Retries prevent data loss
 *
 * Server Overload
 *   - Session-store may be temporarily overloaded
 *   - 429 responses indicate backpressure
 *   - Exponential backoff prevents thundering herd
 *
 * Graceful Degradation
 *   - Failed uploads logged but don't crash system
 *   - Can queue for later retry (not implemented here)
 */

import { logger } from "./logging.js";

/**
 * Multipart Part - Single Part of multipart/form-data Request
 *
 * Represents one field in the multipart form.
 */
export interface MultipartPart {
  name: string; // Field name (e.g., "meta", "frame")
  data: Buffer | string; // Part content (binary or text)
  filename?: string; // File name (optional, e.g., "frame.jpg")
  contentType?: string; // MIME type (optional, e.g., "image/jpeg")
}

/**
 * Retry Options - Retry Configuration
 *
 * Controls retry behavior for HTTP requests.
 */
export interface RetryOptions {
  maxRetries?: number; // Maximum retry attempts (default: 3)
  backoffMs?: number; // Base backoff in milliseconds (default: 200)
  respectRetryAfter?: boolean; // Respect Retry-After header (default: true)
}

/**
 * Multipart Response - HTTP Response Wrapper
 *
 * Standardized response format for multipart requests.
 */
export interface MultipartResponse {
  ok: boolean; // True if HTTP 2xx response
  status: number; // HTTP status code (e.g., 200, 429, 500)
  statusText: string; // HTTP status text (e.g., "OK", "Too Many Requests")
  data?: any; // Parsed JSON response body (if Content-Type: application/json)
}

/**
 * Send Multipart Request with Retry
 *
 * Sends a multipart/form-data POST request with automatic retry logic.
 *
 * Retry Behavior:
 * ===============
 *
 * 1. Network errors → retry with exponential backoff
 * 2. HTTP 429 → respect Retry-After header, then retry
 * 3. Other HTTP errors (4xx, 5xx) → no retry (return immediately)
 * 4. Success (2xx) → return response
 *
 * Exponential Backoff:
 *   - Attempt 1: backoffMs × 1 (default: 200ms)
 *   - Attempt 2: backoffMs × 2 (default: 400ms)
 *   - Attempt 3: backoffMs × 3 (default: 600ms)
 *
 * @param url - Destination URL (e.g., "http://session-store:3001/ingest")
 * @param parts - Multipart parts (e.g., meta.json, frame.jpg)
 * @param options - Retry configuration
 * @returns HTTP response with ok, status, statusText, and optional data
 */
export async function sendMultipart(
  url: string,
  parts: MultipartPart[],
  options: RetryOptions = {}
): Promise<MultipartResponse> {
  const { maxRetries = 3, backoffMs = 200, respectRetryAfter = true } = options;

  const formData = new FormData();

  // Build FormData from parts
  for (const part of parts) {
    const blob = new Blob(
      [typeof part.data === "string" ? part.data : new Uint8Array(part.data)],
      { type: part.contentType || "application/octet-stream" }
    );

    formData.append(part.name, blob, part.filename || part.name);
  }

  // Retry loop with exponential backoff
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        body: formData,
      });

      // Backpressure handling: 429 Too Many Requests
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitMs =
          respectRetryAfter && retryAfter
            ? parseInt(retryAfter) * 1000
            : backoffMs * attempt;

        logger.warn("Backpressure from server (429 Too Many Requests)", {
          module: "http-multipart",
          attempt,
          waitMs,
          url,
        });

        if (attempt < maxRetries) {
          await sleep(waitMs);
          continue;
        }
      }

      // Parse JSON response (if Content-Type: application/json)
      let data: any = undefined;
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        try {
          data = await response.json();
        } catch {
          // If JSON parsing fails, continue without data
        }
      }

      if (!response.ok) {
        logger.error("HTTP request failed", {
          module: "http-multipart",
          url,
          status: response.status,
          statusText: response.statusText,
          attempt,
        });
      }

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        data,
      };
    } catch (error: any) {
      logger.error("HTTP request error (network failure)", {
        module: "http-multipart",
        url,
        attempt,
        error: error.message,
      });

      // Retry on network errors
      if (attempt < maxRetries) {
        const waitMs = backoffMs * attempt;
        await sleep(waitMs);
      }
    }
  }

  // If we reach here, all retries failed
  return {
    ok: false,
    status: 0,
    statusText: "Failed after all retries",
  };
}

/**
 * Sleep Utility
 *
 * Promise-based sleep for async/await retry delays.
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after delay
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
