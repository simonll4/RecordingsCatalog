/**
 * RGB Capture Port - Interfaz para captura de frames RGB
 *
 * Define el contrato para extraer frames RGB de una fuente (SHM, archivo, red, etc.)
 * y entregarlos junto a metadatos para procesamiento (IA, encoding, etc.).
 */

import { FrameMeta } from "../../../types/detections.js";

/** Callback ejecutado por cada frame RGB procesado. */
export type OnFrameFn = (rgb: Buffer, meta: FrameMeta) => void;

export interface RGBCapture {
  /**
   * Inicia el pipeline de captura y comienza a emitir frames RGB.
   * @param onFrame - Callback ejecutado por cada frame RGB
   */
  start(onFrame: OnFrameFn): Promise<void>;

  /** Detiene el pipeline y libera recursos del proceso hijo. */
  stop(): Promise<void>;

  /**
   * Cambia el modo de FPS (idle/active) reiniciando el pipeline si corresponde.
   * @param mode - "idle" para baja tasa de captura, "active" para alta
   */
  setMode(mode: "idle" | "active"): void;
}
