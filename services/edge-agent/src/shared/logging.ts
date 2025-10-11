/**
 * Logging - Structured Logging System
 *
 * Centralized logger with configurable levels and consistent formatting.
 * Used by all Edge Agent modules for uniform log output.
 *
 * Features:
 * =========
 *
 * Log Levels
 *   - debug: Internal details (e.g., each frame processed)
 *   - info: Important events (e.g., state transitions)
 *   - warn: Abnormal but recoverable situations (e.g., retry)
 *   - error: Critical errors (e.g., module crash)
 *
 * Structured Format
 *   - Timestamp + level + message + fields
 *   - Optional fields: module, deviceId, sessionId, state, event, etc.
 *   - Parseable output (easy to grep, filter, analyze)
 *
 * Runtime Configuration
 *   - setLevel() to filter by minimum level
 *   - LOG_LEVEL env var for initial level
 *   - Can change level during runtime
 *
 * Singleton Pattern
 *   - Single logger instance exported
 *   - Import from any module
 *   - Consistent format across codebase
 *
 * Usage Example:
 * ==============
 *
 * ```typescript
 * import { logger } from "./shared/logging.js";
 *
 * logger.info("Server started", { module: "main", port: 3000 });
 * logger.debug("Processing frame", { module: "ai", fps: 12 });
 * logger.error("Failed to connect", { module: "store", error: err.message });
 * ```
 *
 * Output Format:
 * ==============
 *
 * ```
 * 2024-01-15T10:30:45.123Z [INFO ] Server started | module="main" port=3000
 * 2024-01-15T10:30:46.456Z [DEBUG] Processing frame | module="ai" fps=12
 * 2024-01-15T10:30:47.789Z [ERROR] Failed to connect | module="store" error="ECONNREFUSED"
 * ```
 *
 * Why Structured Logging?
 * =======================
 *
 * Parseable
 *   - Easy to extract fields (e.g., grep module="ai")
 *   - Machine-readable for log aggregation tools
 *   - Enables filtering and analysis
 *
 * Consistent
 *   - All logs follow same format
 *   - Predictable structure across modules
 *   - Easy to write log parsers
 *
 * Context-Aware
 *   - Fields provide context without verbosity
 *   - No need to embed values in message string
 *   - Searchable by any field
 *
 * Filterable
 *   - Change level at runtime (e.g., LOG_LEVEL=debug)
 *   - Reduce noise in production
 *   - Enable debug for troubleshooting
 */

/**
 * Log Level Enumeration
 *
 * debug: Verbose internal details (disabled in production usually)
 * info: Important events and state changes
 * warn: Abnormal situations that are recoverable
 * error: Critical errors requiring attention
 */
type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Log Fields - Structured Context
 *
 * Optional key-value pairs attached to log messages.
 *
 * Common Fields:
 * ==============
 *
 * module: Module name (e.g., "orchestrator", "ai", "camera")
 * deviceId: Edge device unique identifier
 * sessionId: Active recording session UUID
 * state: FSM current state (e.g., "ACTIVE")
 * event: Event type being processed (e.g., "ai.detection")
 * attempt: Retry attempt number
 * latMs: Latency in milliseconds
 * error: Error message string
 * config: Configuration object (sanitized)
 *
 * Extensible: Add any custom fields as needed
 */
type LogFields = {
  module?: string;
  deviceId?: string;
  sessionId?: string;
  state?: string;
  event?: string;
  attempt?: number;
  latMs?: number;
  [key: string]: unknown;  // Allow any additional fields
};

/**
 * Logger Class - Main Logging Implementation
 *
 * Singleton instance exported as `logger` constant.
 *
 * Configuration:
 * ==============
 *
 * Log level is set in main.ts from CONFIG.logLevel.
 * Default level: "info" (shows info, warn, error).
 *
 * Change level dynamically:
 *   logger.setLevel("debug") - Show all logs
 *   logger.setLevel("error") - Only critical errors
 */
class Logger {
  private level: LogLevel = "info";
  private baseFields: LogFields = {}; // For logger.child()

  // Level → priority mapping (for filtering)
  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  /**
   * Set Log Level
   *
   * Only logs with level >= configured level are printed.
   *
   * Example:
   *   setLevel("warn") → only warn and error printed
   *   setLevel("debug") → all logs printed
   *
   * @param level - Minimum level to log
   */
  setLevel(level: LogLevel) {
    this.level = level;
  }

  /**
   * Create Child Logger with Preloaded Fields
   *
   * Useful for avoiding repetition of common fields like module name.
   * Child logger inherits parent's log level and adds base fields to every log.
   *
   * Example:
   * ```typescript
   * const log = logger.child({ module: "ai-feeder" });
   * log.info("Started"); // Automatically includes module="ai-feeder"
   * log.debug("Frame sent", { frameId: "123" }); // Combines both fields
   * ```
   *
   * Use Case:
   *   - Module-level loggers: Each module creates a child with its name
   *   - Session-scoped loggers: Include sessionId in all related logs
   *   - Device-scoped loggers: Include deviceId automatically
   *
   * @param fields - Base fields to include in all logs from this logger
   * @returns New logger instance with preloaded fields
   */
  child(fields: LogFields): Logger {
    const childLogger = new Logger();
    childLogger.level = this.level;
    childLogger.baseFields = { ...this.baseFields, ...fields };
    return childLogger;
  }

  /**
   * Check if Log Should Be Printed
   *
   * Compares priority of message level vs configured level.
   *
   * @param level - Level of the message
   * @returns true if should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.level];
  }

  /**
   * Format Log Message
   *
   * Creates structured log line with timestamp + level + message + fields.
   *
   * Format: `{timestamp} [{level}] {message} | key="value" ...`
   *
   * Example Output:
   *   2024-01-15T10:30:45.123Z [INFO ] FSM transition | module="orchestrator" from="IDLE" to="DWELL"
   *
   * @param level - Log level (debug/info/warn/error)
   * @param msg - Descriptive message
   * @param fields - Optional structured fields
   * @returns Formatted log string
   */
  private format(level: LogLevel, msg: string, fields?: LogFields): string {
    const timestamp = new Date().toISOString();
    const levelUpper = level.toUpperCase().padEnd(5);

    let output = `${timestamp} [${levelUpper}] ${msg}`;

    // Merge baseFields (from child) with log-specific fields
    const allFields = { ...this.baseFields, ...fields };

    // Append fields as key="value" (JSON-parseable format)
    if (Object.keys(allFields).length > 0) {
      const fieldsStr = Object.entries(allFields)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(" ");
      output += ` | ${fieldsStr}`;
    }

    return output;
  }

  /**
   * Log at DEBUG Level
   *
   * Used for internal details (e.g., each frame processed).
   * Only visible with LOG_LEVEL=debug.
   *
   * Example:
   *   logger.debug("Frame submitted to AI", { frameId: "abc123", fps: 12 });
   *
   * @param msg - Descriptive message
   * @param fields - Optional structured fields
   */
  debug(msg: string, fields?: LogFields) {
    if (this.shouldLog("debug")) {
      console.log(this.format("debug", msg, fields));
    }
  }

  /**
   * Log at INFO Level
   *
   * Used for important events (e.g., state transitions, startup).
   * Default level in production.
   *
   * Example:
   *   logger.info("FSM transition", { from: "IDLE", to: "DWELL" });
   *
   * @param msg - Descriptive message
   * @param fields - Optional structured fields
   */
  info(msg: string, fields?: LogFields) {
    if (this.shouldLog("info")) {
      console.log(this.format("info", msg, fields));
    }
  }

  /**
   * Log at WARN Level
   *
   * Used for abnormal but recoverable situations (e.g., retry, fallback).
   * Indicates potential issues that don't require immediate intervention.
   *
   * Example:
   *   logger.warn("Connection failed, retrying", { attempt: 3, error: "ECONNREFUSED" });
   *
   * @param msg - Descriptive message
   * @param fields - Optional structured fields
   */
  warn(msg: string, fields?: LogFields) {
    if (this.shouldLog("warn")) {
      console.warn(this.format("warn", msg, fields));
    }
  }

  /**
   * Log at ERROR Level
   *
   * Used for critical errors (e.g., module crash, unrecoverable failure).
   * Always printed (unless LOG_LEVEL hypothetically set above error).
   *
   * Example:
   *   logger.error("Failed to start camera", { error: err.message, device: "/dev/video0" });
   *
   * @param msg - Descriptive message
   * @param fields - Optional structured fields
   */
  error(msg: string, fields?: LogFields) {
    if (this.shouldLog("error")) {
      console.error(this.format("error", msg, fields));
    }
  }
}

/**
 * Logger Singleton Instance
 *
 * Import from any module to access the shared logger.
 *
 * Usage:
 * ```typescript
 * import { logger } from "./shared/logging.js";
 * logger.info("Hello", { module: "main" });
 * ```
 *
 * Configuration:
 *   Log level is set in main.ts after loading CONFIG.
 *   Default level: "info" until configured.
 */
export const logger = new Logger();
