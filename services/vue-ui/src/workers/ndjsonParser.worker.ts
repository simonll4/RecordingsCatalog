import { expose } from 'comlink'
import { gunzipSync } from 'fflate'
import type { TrackEvent } from '../types/tracks'

// Decoder para convertir bytes en string UTF-8
const decoder = new TextDecoder()

/**
 * Parseador simple de NDJSON: linea por linea intenta JSON.parse y
 * añade los eventos válidos al array resultante.
 */
const parseNdjson = (text: string): TrackEvent[] => {
  const events: TrackEvent[] = []
  const lines = text.split('\n')
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    try {
      const parsed = JSON.parse(line) as TrackEvent
      events.push(parsed)
    } catch (error) {
      // No rompemos con líneas malformadas; las ignoramos y avisamos
      console.warn('Failed to parse NDJSON line', error)
    }
  }
  return events
}

/**
 * Convierte un ArrayBuffer (posiblemente comprimido) en TrackEvent[].
 * - Soporta `gzip` y `identity` (sin compresión).
 * - Lanza error si la codificación HTTP reportada no es soportada.
 */
const parseBuffer = (data: ArrayBufferLike, encoding: string | null): TrackEvent[] => {
  let uint8: Uint8Array = new Uint8Array(data)
  const encodingNormalized = encoding?.toLowerCase() ?? null

  if (encodingNormalized === 'gzip') {
    uint8 = gunzipSync(uint8) as Uint8Array
  } else if (encodingNormalized && encodingNormalized !== 'identity') {
    throw new Error(`Unsupported encoding: ${encodingNormalized}`)
  }

  const text = decoder.decode(uint8)
  return parseNdjson(text)
}

// API expuesta por el worker. Se usa via `comlink.wrap` en el hilo principal.
const workerApi = {
  parseSegment(data: ArrayBuffer, encoding: string | null): TrackEvent[] {
    return parseBuffer(data, encoding)
  },
}

export type NdjsonParserWorker = typeof workerApi

expose(workerApi)
