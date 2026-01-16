/**
 * Publisher Port - Interfaz para streaming de video
 *
 * Define el contrato para publicar streams de video (RTSP, HLS, WebRTC, etc.)
 * desde una fuente (SHM, archivo, etc.) hacia un servidor/cliente.
 */

export interface Publisher {
  /** Inicia el pipeline de streaming. */
  start(): Promise<void>;
  
  /** 
   * Detiene el pipeline de streaming.
   * @param graceMs - Tiempo de gracia en milisegundos para cierre ordenado
   */
  stop(graceMs?: number): Promise<void>;
}
