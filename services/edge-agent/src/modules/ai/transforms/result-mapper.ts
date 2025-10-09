/**
 * Result Mapper - Transformaciones puras para resultados de IA
 *
 * Funciones puras para mapear respuestas del protocolo Protobuf a tipos internos.
 * Separadas de la lógica de transporte para facilitar testing y reutilización.
 */

import Long from "long";
import pb from "../../../proto/ai_pb_wrapper.js";
import { Result } from "../ports/ai-client.js";

/**
 * Convierte un resultado Protobuf del worker a tipo Result interno.
 * Maneja conversión segura de tipos (Long → bigint) y valores por defecto.
 */
export function mapProtobufResult(pbResult: pb.ai.IResult): Result {
  const seq = Number(pbResult.seq || 0);

  // Mapear detecciones con valores por defecto seguros
  const detections =
    pbResult.detections?.map((d: any) => ({
      cls: d.cls || "",
      conf: d.conf || 0,
      bbox: [
        d.bbox?.x || 0,
        d.bbox?.y || 0,
        d.bbox?.w || 0,
        d.bbox?.h || 0,
      ] as [number, number, number, number],
      trackId: d.trackId || undefined,
    })) || [];

  // Convertir tsMonoNs (number | Long) a bigint de forma segura
  let tsMonoNsBig: bigint = BigInt(0);
  if (typeof pbResult.tsMonoNs === "number") {
    tsMonoNsBig = BigInt(pbResult.tsMonoNs);
  } else if (
    pbResult.tsMonoNs &&
    typeof (pbResult.tsMonoNs as Long).toString === "function"
  ) {
    tsMonoNsBig = BigInt((pbResult.tsMonoNs as Long).toString());
  }

  return {
    seq,
    tsIso: pbResult.tsIso || "",
    tsMonoNs: tsMonoNsBig,
    detections,
  };
}
