/**
 * Camera Hub Port - Interfaz para captura de video always-on
 *
 * Define el contrato para un hub de cámara que captura continuamente
 * y expone los frames vía memoria compartida (SHM) o similar.
 */

export interface CameraHub {
  /** Inicia el pipeline de captura. */
  start(): Promise<void>;

  /** Detiene el pipeline y libera recursos. */
  stop(): Promise<void>;

  /**
   * Espera hasta que el hub esté listo (criterio AND: PLAYING + socket exists).
   * @param timeoutMs - Timeout en milisegundos (default: 5000)
   */
  ready(timeoutMs?: number): Promise<void>;
}
