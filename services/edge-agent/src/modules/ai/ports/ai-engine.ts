/**
 * AI Engine Port - Interfaz para motores de inferencia
 *
 * Define el contrato que debe cumplir cualquier motor de IA utilizado por el orquestador.
 * Permite inyectar diferentes implementaciones (TCP, local, mock, etc.) sin cambiar la lógica del orquestador.
 */

export interface AIEngine {
  /**
   * Establece el session ID activo para envío de frames al store.
   * Debe llamarse cuando el orquestador abre una nueva sesión.
   */
  setSessionId(sessionId: string): void;

  /**
   * Notifica que la sesión actual finalizó.
   * Debe limpiar el estado interno y enviar End al worker remoto.
   */
  closeSession(sessionId: string): Promise<void>;
}
