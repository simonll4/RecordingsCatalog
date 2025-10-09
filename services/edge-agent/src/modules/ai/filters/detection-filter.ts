/**
 * Detection Filter - Filtrado puro de detecciones
 *
 * Funciones puras para filtrar detecciones por umbral de confianza y clases.
 * Lógica reutilizable y testeable, independiente de infraestructura.
 */

import { Result } from "../ports/ai-client.js";

/** Configuración de filtrado de detecciones. */
export type FilterConfig = {
  /** Umbral mínimo de confianza (0-1) */
  umbral: number;
  /** Set de clases permitidas (vacío = todas las clases) */
  classesFilter: Set<string>;
};

/**
 * Filtra detecciones por umbral de confianza y clases permitidas.
 * Retorna array de detecciones que cumplen ambos criterios.
 */
export function filterDetections(
  result: Result,
  config: FilterConfig
): Result["detections"] {
  return result.detections.filter((d) => {
    // Filtrar por umbral de confianza
    if (d.conf < config.umbral) return false;

    // Filtrar por clases (si hay filtro configurado)
    if (config.classesFilter.size > 0 && !config.classesFilter.has(d.cls)) {
      return false;
    }

    return true;
  });
}

/**
 * Calcula el score global de un conjunto de detecciones.
 * Usa la máxima confianza encontrada.
 */
export function calculateScore(detections: Result["detections"]): number {
  if (detections.length === 0) return 0;
  return Math.max(...detections.map((d) => d.conf));
}

/**
 * Determina si un conjunto de detecciones es relevante.
 * Relevante = al menos una detección después del filtrado.
 */
export function isRelevant(detections: Result["detections"]): boolean {
  return detections.length > 0;
}
