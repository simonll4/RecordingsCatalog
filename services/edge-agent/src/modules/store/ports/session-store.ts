/**
 * Session Store Port - Interfaz para persistencia de sesiones
 *
 * Define el contrato para gestionar sesiones de grabación.
 * Abstrae el backend (HTTP API, DB local, S3, etc.) del resto del sistema.
 * 
 * NOTA: El envío de detecciones ahora se maneja directamente por el AI Engine
 * vía FrameIngester (/ingest endpoint), NO por este store.
 */

export interface SessionStore {
  /** 
   * Abre una nueva sesión de grabación.
   * @param startTs - Timestamp ISO de inicio (opcional, se genera si no se provee)
   * @returns sessionId - ID único de la sesión
   */
  open(startTs?: string): Promise<string>;
  
  /** 
   * Cierra una sesión de grabación.
   * @param sessionId - ID de la sesión
   * @param endTs - Timestamp ISO de fin (opcional, se genera si no se provee)
   */
  close(sessionId: string, endTs?: string): Promise<void>;
}
