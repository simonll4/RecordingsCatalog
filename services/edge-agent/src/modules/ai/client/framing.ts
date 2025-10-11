/**
 * Framing - Length-prefixed framing helpers
 *
 * Helpers para el protocolo TCP con mensajes length-prefixed (uint32LE).
 *
 * Formato del frame:
 * - 4 bytes: length (uint32LE) - tamaño del payload
 * - N bytes: payload (mensaje protobuf serializado)
 *
 * Límites:
 * - Tamaño mínimo: 1 byte
 * - Tamaño máximo: 50 MB (50 * 1024 * 1024 bytes)
 *
 * Responsabilidades:
 * - Encode: Agregar header de longitud a payload
 * - Decode: Extraer mensajes completos del buffer RX
 * - Validación de límites
 */

import { logger } from "../../../shared/logging.js";
import pb from "../../../proto/ai_pb_wrapper.js";

// Límites de frame
const MIN_FRAME_SIZE = 1;
const MAX_FRAME_SIZE = 50 * 1024 * 1024; // 50 MB

export interface FramingResult {
  /** Mensaje decodificado (null si el buffer no contiene un mensaje completo) */
  envelope: pb.ai.IEnvelope | null;
  /** Buffer restante después de extraer el mensaje */
  remaining: Buffer;
}

/**
 * Encode un envelope a formato length-prefixed
 * 
 * @param envelope - Mensaje a enviar
 * @returns [header, payload] - Header de 4 bytes + payload serializado
 */
export function encodeFrame(envelope: pb.ai.IEnvelope): [Buffer, Buffer] {
  const payload = pb.ai.Envelope.encode(envelope).finish();
  const length = payload.length;

  // Validar tamaño
  if (length < MIN_FRAME_SIZE || length > MAX_FRAME_SIZE) {
    throw new Error(
      `Invalid frame size: ${length} (min: ${MIN_FRAME_SIZE}, max: ${MAX_FRAME_SIZE})`
    );
  }

  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(length, 0);

  return [header, Buffer.from(payload)];
}

/**
 * Decode un mensaje del buffer RX
 * 
 * Extrae el primer mensaje completo del buffer, si está disponible.
 * Si el buffer no contiene un mensaje completo, retorna null.
 * 
 * @param buffer - Buffer RX acumulado
 * @returns FramingResult con mensaje decodificado (o null) y buffer restante
 * @throws Error si el length header es inválido o se excede MAX_FRAME_SIZE
 */
export function decodeFrame(buffer: Buffer): FramingResult {
  // Verificar si tenemos al menos el header (4 bytes)
  if (buffer.length < 4) {
    return { envelope: null, remaining: buffer as Buffer };
  }

  // Leer length
  const length = buffer.readUInt32LE(0);

  // Validar length
  if (length === 0 || length > MAX_FRAME_SIZE) {
    logger.error("Invalid frame length", {
      module: "framing",
      length,
      max: MAX_FRAME_SIZE,
    });
    throw new Error(`Invalid frame length: ${length}`);
  }

  // Verificar si tenemos el mensaje completo
  const totalSize = 4 + length;
  if (buffer.length < totalSize) {
    // Mensaje incompleto, esperar más datos
    return { envelope: null, remaining: buffer as Buffer };
  }

  // Extraer payload
  const payload = buffer.subarray(4, totalSize);
  const remaining = buffer.subarray(totalSize) as Buffer;

  // Decodificar protobuf
  try {
    const envelope = pb.ai.Envelope.decode(payload);
    return { envelope, remaining };
  } catch (err) {
    logger.error("Failed to decode protobuf message", {
      module: "framing",
      length,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error(
      `Protobuf decode failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Procesa buffer RX y extrae todos los mensajes disponibles
 * 
 * Útil para procesamiento batch de múltiples mensajes en un solo chunk.
 * 
 * @param buffer - Buffer RX acumulado
 * @returns Array de envelopes decodificados y buffer restante
 */
export function decodeAllFrames(
  buffer: Buffer
): { envelopes: pb.ai.IEnvelope[]; remaining: Buffer } {
  const envelopes: pb.ai.IEnvelope[] = [];
  let current = buffer;

  while (true) {
    const result = decodeFrame(current);

    if (result.envelope === null) {
      // No hay más mensajes completos
      return { envelopes, remaining: result.remaining };
    }

    envelopes.push(result.envelope);
    current = result.remaining;
  }
}
