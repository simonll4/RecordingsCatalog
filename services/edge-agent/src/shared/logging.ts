/**
 * Logging - Sistema de Logging Estructurado
 * 
 * Logger centralizado con niveles configurables y formato consistente.
 * Usado por todos los módulos del Edge Agent.
 * 
 * Características:
 * 
 * - 4 niveles: debug, info, warn, error
 * - Formato estructurado: timestamp + level + mensaje + fields
 * - Fields opcionales: module, deviceId, sessionId, state, event, etc.
 * - Configurable: setLevel() para filtrar por nivel
 * - Singleton: logger importado desde cualquier módulo
 * 
 * Uso:
 * 
 * ```typescript
 * import { logger } from "./shared/logging.js";
 * 
 * logger.info("Server started", { module: "main", port: 3000 });
 * logger.debug("Processing frame", { module: "ai", fps: 12 });
 * logger.error("Failed to connect", { module: "store", error: err.message });
 * ```
 * 
 * Formato de salida:
 * 
 * ```
 * 2024-01-15T10:30:45.123Z [INFO ] Server started | module="main" port=3000
 * 2024-01-15T10:30:46.456Z [DEBUG] Processing frame | module="ai" fps=12
 * 2024-01-15T10:30:47.789Z [ERROR] Failed to connect | module="store" error="ECONNREFUSED"
 * ```
 * 
 * ¿Por qué structured logging?
 * 
 * - Parseable: Fácil extraer campos (ej: grep module="ai")
 * - Consistente: Todos los logs tienen mismo formato
 * - Filtrable: Cambiar nivel en runtime (ej: LOG_LEVEL=debug)
 * - Context-aware: Fields proveen contexto sin verbosidad
 */

/**
 * LogLevel - Niveles de logging disponibles
 * 
 * - debug: Detalles internos (ej: cada frame procesado)
 * - info: Eventos importantes (ej: transiciones de estado)
 * - warn: Situaciones anormales pero recuperables (ej: retry)
 * - error: Errores críticos (ej: módulo crasheó)
 */
type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * LogFields - Campos estructurados opcionales
 * 
 * Campos comunes:
 * 
 * - module: Nombre del módulo (ej: "orchestrator", "ai", "camera")
 * - deviceId: ID del dispositivo edge
 * - sessionId: ID de sesión activa
 * - state: Estado actual de FSM (ej: "ACTIVE")
 * - event: Tipo de evento procesado (ej: "ai.detection")
 * - attempt: Número de intento (ej: retry #3)
 * - latMs: Latencia en milisegundos
 * 
 * Extensible: Cualquier campo adicional (key: valor)
 */
type LogFields = {
  module?: string;
  deviceId?: string;
  sessionId?: string;
  state?: string;
  event?: string;
  attempt?: number;
  latMs?: number;
  [key: string]: unknown;
};

/**
 * Logger - Clase principal de logging
 * 
 * Singleton exportado como `logger`.
 * Nivel configurado en main.ts desde CONFIG.logLevel.
 */
class Logger {
  private level: LogLevel = "info";
  
  // Mapeo nivel → prioridad (para filtrado)
  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  /**
   * Configura nivel de logging
   * 
   * Solo logs con nivel >= configurado se imprimen.
   * Ejemplo: setLevel("warn") → solo warn y error
   * 
   * @param level - Nivel mínimo a loguear
   */
  setLevel(level: LogLevel) {
    this.level = level;
  }

  /**
   * Determina si un log debe imprimirse
   * 
   * Compara prioridad del nivel del mensaje vs nivel configurado.
   * 
   * @param level - Nivel del mensaje
   * @returns true si debe loguearse
   */
  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.level];
  }

  /**
   * Formatea mensaje de log con timestamp + nivel + fields
   * 
   * Formato: `{timestamp} [{level}] {message} | key="value" ...`
   * 
   * @param level - Nivel del log
   * @param msg - Mensaje descriptivo
   * @param fields - Campos estructurados opcionales
   * @returns String formateado
   */
  private format(level: LogLevel, msg: string, fields?: LogFields): string {
    const timestamp = new Date().toISOString();
    const levelUpper = level.toUpperCase().padEnd(5);
    
    let output = `${timestamp} [${levelUpper}] ${msg}`;
    
    // Agregar fields como key="value" (JSON-parseable)
    if (fields && Object.keys(fields).length > 0) {
      const fieldsStr = Object.entries(fields)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(" ");
      output += ` | ${fieldsStr}`;
    }
    
    return output;
  }

  /**
   * Log a nivel DEBUG
   * 
   * Usado para detalles internos (ej: cada frame procesado).
   * Solo visible con LOG_LEVEL=debug.
   * 
   * @param msg - Mensaje descriptivo
   * @param fields - Campos opcionales
   */
  debug(msg: string, fields?: LogFields) {
    if (this.shouldLog("debug")) {
      console.log(this.format("debug", msg, fields));
    }
  }

  /**
   * Log a nivel INFO
   * 
   * Usado para eventos importantes (ej: transiciones de estado).
   * Nivel por defecto en producción.
   * 
   * @param msg - Mensaje descriptivo
   * @param fields - Campos opcionales
   */
  info(msg: string, fields?: LogFields) {
    if (this.shouldLog("info")) {
      console.log(this.format("info", msg, fields));
    }
  }

  /**
   * Log a nivel WARN
   * 
   * Usado para situaciones anormales pero recuperables (ej: retry).
   * Indica problemas potenciales que no requieren intervención inmediata.
   * 
   * @param msg - Mensaje descriptivo
   * @param fields - Campos opcionales
   */
  warn(msg: string, fields?: LogFields) {
    if (this.shouldLog("warn")) {
      console.warn(this.format("warn", msg, fields));
    }
  }

  /**
   * Log a nivel ERROR
   * 
   * Usado para errores críticos (ej: módulo crasheó).
   * Siempre se imprimen (a menos que LOG_LEVEL > error, imposible).
   * 
   * @param msg - Mensaje descriptivo
   * @param fields - Campos opcionales
   */
  error(msg: string, fields?: LogFields) {
    if (this.shouldLog("error")) {
      console.error(this.format("error", msg, fields));
    }
  }
}

/**
 * logger - Singleton de Logger
 * 
 * Importar desde cualquier módulo:
 * 
 * ```typescript
 * import { logger } from "./shared/logging.js";
 * logger.info("Hello", { module: "main" });
 * ```
 * 
 * Nota: Nivel se configura desde main.ts después de cargar CONFIG
 */
export const logger = new Logger();
