/**
 * Frame Ingester - Envía frames comprimidos + detecciones al Session Store
 *
 * Responsable de:
 * - Comprimir frames NV12/I420/RGB a JPEG
 * - Crear payload multipart (meta.json + frame.jpg)
 * - Enviar al endpoint /ingest del session-store
 * - Manejar backpressure (429) con reintentos
 */

import { logger } from "../../../shared/logging.js";
import { metrics } from "../../../shared/metrics.js";
import { Detection } from "../../../types/detections.js";
import type { NV12FrameMeta } from "../../video/adapters/gstreamer/nv12-capture-gst.js";
import sharp from "sharp";

export type IngestPayload = {
  sessionId: string;
  seqNo: number;
  captureTs: string;
  detections: Array<{
    trackId: string;
    cls: string;
    conf: number;
    bbox: { x: number; y: number; w: number; h: number };
  }>;
};

export class FrameIngester {
  private baseUrl: string;
  private maxRetries = 3;
  private backoffMs = 200;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Envía frame + metadatos al session-store
   * 
   * @param payload - Metadatos de las detecciones
   * @param frameBuffer - Buffer del frame (RGB o JPEG)
   * @param width - Ancho del frame
   * @param height - Alto del frame
   * @param isJpeg - Si el buffer ya es JPEG (default: false)
   * @returns true si se envió exitosamente, false si falló
   */
  async ingest(
    payload: IngestPayload,
    frameBuffer: Buffer,
    width: number,
    height: number,
    isJpeg: boolean = false
  ): Promise<boolean> {
    // Si ya es JPEG, usarlo directamente; si no, comprimir
    const frameCompressed = isJpeg 
      ? frameBuffer 
      : await this.compressToJpeg(frameBuffer, width, height);

    // Crear FormData multipart
    const formData = new FormData();

    // Parte 1: meta (JSON)
    const metaBlob = new Blob([JSON.stringify(payload)], {
      type: "application/json",
    });
    formData.append("meta", metaBlob, "meta.json");

    // Parte 2: frame (binario)
    const frameBlob = new Blob([new Uint8Array(frameCompressed)], {
      type: "image/jpeg",
    });
    formData.append("frame", frameBlob, "frame.jpg");

    // Enviar con reintentos
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/ingest`, {
          method: "POST",
          body: formData,
        });

        if (response.status === 429) {
          // Backpressure: esperar y reintentar
          const retryAfter = response.headers.get("Retry-After");
          const waitMs = retryAfter
            ? parseInt(retryAfter) * 1000
            : this.backoffMs * attempt;

          logger.warn("Backpressure from session-store", {
            module: "frame-ingester",
            attempt,
            waitMs,
          });

          await this.sleep(waitMs);
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        logger.debug("Frame ingested successfully", {
          module: "frame-ingester",
          sessionId: payload.sessionId,
          seqNo: payload.seqNo,
          inserted: result.inserted,
          updated: result.updated,
          skipped: result.skipped,
        });

        metrics.inc("frame_ingest_ok_total");
        return true;
      } catch (error: any) {
        logger.error("Frame ingest failed", {
          module: "frame-ingester",
          attempt,
          error: error.message,
        });

        metrics.inc("frame_ingest_error_total");

        if (attempt < this.maxRetries) {
          await this.sleep(this.backoffMs * attempt);
        }
      }
    }

    logger.error("Frame ingest failed after all retries", {
      module: "frame-ingester",
      sessionId: payload.sessionId,
      seqNo: payload.seqNo,
    });

    return false;
  }

  /**
   * Envía frame NV12/I420 + metadatos al session-store
   * Convierte NV12/I420 → JPEG antes de enviar
   * 
   * @param payload - Metadatos de las detecciones
   * @param nv12Data - Buffer NV12/I420 crudo
   * @param meta - Metadata del frame (format, planes, etc)
   * @returns true si se envió exitosamente, false si falló
   */
  async ingestNV12(
    payload: IngestPayload,
    nv12Data: Buffer,
    meta: NV12FrameMeta
  ): Promise<boolean> {
    try {
      // Convertir NV12/I420 → JPEG usando sharp
      const jpegBuffer = await this.convertNV12ToJpeg(nv12Data, meta);

      // Crear FormData multipart
      const formData = new FormData();

      // Parte 1: meta (JSON)
      const metaBlob = new Blob([JSON.stringify(payload)], {
        type: "application/json",
      });
      formData.append("meta", metaBlob, "meta.json");

      // Parte 2: frame (JPEG)
      const frameBlob = new Blob([new Uint8Array(jpegBuffer)], {
        type: "image/jpeg",
      });
      formData.append("frame", frameBlob, "frame.jpg");

      // Enviar con reintentos
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          const response = await fetch(`${this.baseUrl}/ingest`, {
            method: "POST",
            body: formData,
          });

          if (response.status === 429) {
            // Backpressure: esperar y reintentar
            const retryAfter = response.headers.get("Retry-After");
            const waitMs = retryAfter
              ? parseInt(retryAfter) * 1000
              : this.backoffMs * attempt;

            logger.warn("Backpressure from session-store", {
              module: "frame-ingester",
              attempt,
              waitMs,
            });

            await this.sleep(waitMs);
            continue;
          }

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const result = await response.json();

          logger.debug("Frame ingested successfully", {
            module: "frame-ingester",
            sessionId: payload.sessionId,
            seqNo: payload.seqNo,
            inserted: result.inserted,
            updated: result.updated,
            skipped: result.skipped,
          });

          metrics.inc("frame_ingest_ok_total");
          return true;
        } catch (error: any) {
          logger.error("Frame ingest failed", {
            module: "frame-ingester",
            attempt,
            error: error.message,
          });

          metrics.inc("frame_ingest_error_total");

          if (attempt < this.maxRetries) {
            await this.sleep(this.backoffMs * attempt);
          }
        }
      }

      logger.error("Frame ingest failed after all retries", {
        module: "frame-ingester",
        sessionId: payload.sessionId,
        seqNo: payload.seqNo,
      });

      return false;
    } catch (error: any) {
      logger.error("NV12 ingest failed", {
        module: "frame-ingester",
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Convierte NV12/I420 a JPEG usando sharp
   */
  private async convertNV12ToJpeg(
    data: Buffer,
    meta: NV12FrameMeta
  ): Promise<Buffer> {
    try {
      // Sharp no soporta NV12/I420 directamente, necesitamos convertir a RGB primero
      // O usar un formato que sharp entienda
      
      // Por ahora, intentamos con formato raw y dejamos que sharp lo maneje
      const format = meta.format === "NV12" ? "nv12" : "yuv420";
      
      const jpegBuffer = await sharp(data, {
        raw: {
          width: meta.width,
          height: meta.height,
          channels: 1, // YUV es 1 canal (planar)
        },
      })
        .jpeg({
          quality: 85,
          chromaSubsampling: "4:2:0",
          force: true,
        })
        .toBuffer();

      logger.debug("NV12→JPEG conversion successful", {
        module: "frame-ingester",
        format: meta.format,
        originalSize: data.length,
        compressedSize: jpegBuffer.length,
        ratio: ((jpegBuffer.length / data.length) * 100).toFixed(1) + "%",
      });

      return jpegBuffer;
    } catch (error: any) {
      logger.error("NV12→JPEG conversion failed", {
        module: "frame-ingester",
        format: meta.format,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Comprime RGB a JPEG usando sharp
   */
  private async compressToJpeg(
    rgb: Buffer,
    width: number,
    height: number
  ): Promise<Buffer> {
    try {
      // Verificar tamaño esperado
      const expectedSize = width * height * 3; // RGB = 3 bytes por pixel
      if (rgb.length !== expectedSize) {
        logger.warn("Frame size mismatch", {
          module: "frame-ingester",
          expected: expectedSize,
          actual: rgb.length,
          width,
          height,
        });
      }

      const jpegBuffer = await sharp(rgb, {
        raw: {
          width,
          height,
          channels: 3, // RGB
        },
      })
        .toColorspace("srgb") // Asegurar espacio de color sRGB
        .jpeg({
          quality: 85,
          chromaSubsampling: "4:2:0",
          force: true, // Forzar salida JPEG
        })
        .toBuffer();

      logger.debug("JPEG compression successful", {
        module: "frame-ingester",
        originalSize: rgb.length,
        compressedSize: jpegBuffer.length,
        ratio: (jpegBuffer.length / rgb.length * 100).toFixed(1) + "%",
      });

      return jpegBuffer;
    } catch (error: any) {
      logger.error("JPEG compression failed, sending raw RGB", {
        module: "frame-ingester",
        error: error.message,
        stack: error.stack,
      });
      return rgb;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
