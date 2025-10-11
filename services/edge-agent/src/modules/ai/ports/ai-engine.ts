/**
 * AI Engine Port - Interfaz para motores de inferencia
 *
 * Define el contrato que debe cumplir cualquier motor de IA utilizado por el orquestador.
 * Permite inyectar diferentes implementaciones (TCP, local, mock, etc.) sin cambiar la lógica del orquestador.
 */

import { FrameMeta } from "../../../types/detections.js";

export interface AIEngine {
  /**
   * Configura el modelo de IA en el worker remoto.
   * - `modelName`: path/nombre del modelo (interpretado por el worker)
   * - `umbral`: confianza mínima para validar detecciones
   * - `width`/`height`: resolución de inferencia (ej: 640x640)
   * - `classesFilter`: clases a filtrar (solo estas serán consideradas relevantes)
   */
  setModel(opts: {
    modelName: string;
    umbral: number;
    width: number;
    height: number;
    classesFilter?: string[];
  }): Promise<void>;

  /**
   * Establece el session ID activo para envío de frames al store.
   * Debe llamarse cuando el orquestador abre una nueva sesión.
   */
  setSessionId(sessionId: string): void;

  /**
   * Envía un frame RGB al worker para inferencia.
   * Respeta backpressure: si el cliente indica que no hay crédito,
   * no envía el frame (latest-wins se maneja en el cliente).
   */
  run(frame: Buffer, meta: FrameMeta): Promise<void>;
}
