/**
 * Session Store Port - Interfaz para persistencia de sesiones y detecciones
 *
 * Define el contrato para gestionar sesiones de grabación y almacenar detecciones.
 * Abstrae el backend (HTTP API, DB local, S3, etc.) del resto del sistema.
 */

import { Detection } from "../../../types/detections.js";

export interface SessionStore {
  /** 
   * Abre una nueva sesión de grabación.
   * @param startTs - Timestamp ISO de inicio (opcional, se genera si no se provee)
   * @returns sessionId - ID único de la sesión
   */
  open(startTs?: string): Promise<string>;
  
  /** 
   * Agrega detecciones a una sesión existente (con batching interno).
   * @param sessionId - ID de la sesión
   * @param payload - Datos a agregar (deviceId, timestamp, detecciones)
   */
  append(
    sessionId: string,
    payload: { devId: string; ts: string; detects: Detection[] }
  ): Promise<void>;
  
  /** 
   * Cierra una sesión de grabación.
   * @param sessionId - ID de la sesión
   * @param endTs - Timestamp ISO de fin (opcional, se genera si no se provee)
   */
  close(sessionId: string, endTs?: string): Promise<void>;
  
  /** 
   * Fuerza el flush del batch para una sesión específica.
   * @param sessionId - ID de la sesión
   */
  flush(sessionId: string): Promise<void>;
  
  /** 
   * Fuerza el flush de todos los batches pendientes (usado en shutdown).
   */
  flushAll(): Promise<void>;
}
