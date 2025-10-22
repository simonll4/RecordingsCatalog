import { z } from 'zod'
import type { TrackIndex, TrackMeta } from '../types/tracks'
import { MEDIAMTX_BASE_URL, SESSION_STORE_BASE_URL, mediamtxGetUrl } from '../config'

/**
 * Error específico para respuestas HTTP no-ok.
 * Contiene el status y el body parseado (si está disponible) para
 * ayudar al diagnóstico y manejo por parte de los consumidores.
 */
export class HttpError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `HTTP ${status}`)
    this.status = status
    this.body = body
  }
}

const sessionSummarySchema = z.object({
  session_id: z.string(),
  device_id: z.string(),
  path: z.string().optional(),
  status: z.string(),
  start_ts: z.string(),
  end_ts: z.string().nullable(),
  postroll_sec: z.number().nullable().optional(),
  media_connect_ts: z.string().nullable().optional(),
  media_start_ts: z.string().nullable().optional(),
  media_end_ts: z.string().nullable().optional(),
  recommended_start_offset_ms: z.number().nullable().optional(),
  reason: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
})

const rangeSessionsSchema = z.object({
  from: z.string(),
  to: z.string(),
  sessions: z.array(sessionSummarySchema),
})

const listSessionsSchema = z.object({
  sessions: z.array(sessionSummarySchema),
})

const clipResponseSchema = z.object({
  playbackUrl: z.string(),
  start: z.string(),
  duration: z.number(),
  format: z.string().optional(),
  anchorSource: z.string().optional(),
})

const metaSchema = z.object({
  session_id: z.string(),
  device_id: z.string(),
  start_time: z.string(),
  end_time: z.string().nullable(),
  frame_count: z.number(),
  fps: z.number(),
  path: z.string().nullable().optional(),
  video: z.object({
    width: z.number().nullable(),
    height: z.number().nullable(),
    fps: z.number().nullable(),
  }),
  classes: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
      }),
    )
    .default([]),
})

const segmentSchema = z.object({
  i: z.number(),
  t0: z.number(),
  t1: z.number(),
  url: z.string(),
  count: z.number(),
  closed: z.boolean().optional(),
})

const indexSchema = z.object({
  segment_duration_s: z.number(),
  segments: z.array(segmentSchema),
  fps: z.number(),
  duration_s: z.number(),
})

export type SessionSummary = z.infer<typeof sessionSummarySchema>
export type ClipInfo = z.infer<typeof clipResponseSchema>

/**
 * Intenta leer y parsear el cuerpo de una respuesta HTTP.
 * - Si la respuesta está vacía devuelve `null`.
 * - Si el cuerpo es JSON válido devuelve el objeto.
 * - Si no puede parsear como JSON devuelve el texto crudo.
 */
const parseErrorBody = async (response: Response): Promise<unknown> => {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Helper que realiza un `fetch` y valida el JSON resultante usando Zod.
 * Lanza `HttpError` si la respuesta HTTP no es `ok`.
 *
 * @param input URL (como objeto URL) a solicitar
 * @param schema esquema zod para validar el payload
 * @returns payload validado por `schema`
 */
const fetchJson = async <T>(input: URL, schema: z.ZodSchema<T>): Promise<T> => {
  const response = await fetch(input, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    const body = await parseErrorBody(response)
    throw new HttpError(
      response.status,
      body,
      `Request failed (${response.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`,
    )
  }

  const payload = await response.json()
  return schema.parse(payload)
}

// Construye una URL absoluta apuntando al session store usando la base configurada.
const sessionStoreUrl = (path: string) => new URL(path, `${SESSION_STORE_BASE_URL}/`)

/**
 * Lista sesiones desde el session store.
 * - Si `mode === 'all'` solicita `/sessions`.
 * - Por defecto solicita `/sessions/range` con parámetros `from`/`to`.
 * Devuelve un objeto con `mode`, `sessions` y los valores `from`/`to` cuando aplica.
 */
export const listSessions = async (
  params: { mode?: 'range' | 'all'; limit?: number; from?: string; to?: string } = {},
) => {
  if (params.mode === 'all') {
    const url = sessionStoreUrl('/sessions')
    if (params.limit) url.searchParams.set('limit', String(params.limit))
    const data = await fetchJson(url, listSessionsSchema)
    return {
      mode: 'all' as const,
      sessions: data.sessions,
      from: undefined,
      to: undefined,
    }
  }

  const url = sessionStoreUrl('/sessions/range')
  if (params.limit) url.searchParams.set('limit', String(params.limit))
  if (params.from) url.searchParams.set('from', params.from)
  if (params.to) url.searchParams.set('to', params.to)
  const data = await fetchJson(url, rangeSessionsSchema)
  return {
    mode: 'range' as const,
    sessions: data.sessions,
    from: data.from,
    to: data.to,
  }
}

export const fetchSessionMeta = async (sessionId: string): Promise<TrackMeta | null> => {
  const url = sessionStoreUrl(`/sessions/${encodeURIComponent(sessionId)}/meta`)
  try {
    const meta = await fetchJson(url, metaSchema)
    return {
      ...meta,
      classes: meta.classes ?? [],
    }
  } catch (error) {
    // Si el recurso no existe devolvemos null; otros errores se re-lanzan.
    if (error instanceof HttpError && error.status === 404) {
      return null
    }
    throw error
  }
}

export const fetchSessionIndex = async (sessionId: string): Promise<TrackIndex | null> => {
  const url = sessionStoreUrl(`/sessions/${encodeURIComponent(sessionId)}/index`)
  try {
    return await fetchJson(url, indexSchema)
  } catch (error) {
    // 404 -> index no disponible todavía
    if (error instanceof HttpError && error.status === 404) {
      return null
    }
    throw error
  }
}

export const fetchSessionClip = async (sessionId: string): Promise<ClipInfo> => {
  const url = sessionStoreUrl(`/sessions/${encodeURIComponent(sessionId)}/clip`)
  const data = await fetchJson(url, clipResponseSchema)
  // Intentar reescribir la URL de playback para apuntar al endpoint /get de MediaMTX.
  // Si la URL no es parseable, caemos a un fallback que intenta reconstruirla.
  try {
    const original = new URL(data.playbackUrl)
    data.playbackUrl = mediamtxGetUrl(original.search)
  } catch (error) {
    console.warn('Failed to rewrite playback URL, falling back to original', error)
    if (!data.playbackUrl.startsWith(MEDIAMTX_BASE_URL)) {
      data.playbackUrl = `${MEDIAMTX_BASE_URL}/get${new URL(data.playbackUrl, MEDIAMTX_BASE_URL).search}`
    }
  }

  return data
}

export interface SegmentFetchResult {
  buffer: ArrayBuffer
  encoding: string | null
}

export const fetchSessionSegment = async (
  sessionId: string,
  segmentIndex: number,
): Promise<SegmentFetchResult> => {
  const url = sessionStoreUrl(
    `/sessions/${encodeURIComponent(sessionId)}/segment/${encodeURIComponent(String(segmentIndex))}`,
  )
  const response = await fetch(url, {
    headers: {
      Accept: 'application/x-ndjson',
    },
  })

  if (!response.ok) {
    const body = await parseErrorBody(response)
    throw new HttpError(
      response.status,
      body,
      `Failed to fetch segment ${segmentIndex}: ${typeof body === 'string' ? body : JSON.stringify(body)}`,
    )
  }

  const buffer = await response.arrayBuffer()
  const encoding = response.headers.get('content-encoding')
  return {
    buffer,
    encoding,
  }
}

/**
 * Obtiene la sesión completa y construye la URL de playback localmente.
 * Si media_start_ts está disponible, lo usa como ancla; de lo contrario intenta /clip como fallback.
 */
export const fetchSession = async (sessionId: string): Promise<SessionSummary> => {
  const url = sessionStoreUrl(`/sessions/${encodeURIComponent(sessionId)}`)
  return await fetchJson(url, sessionSummarySchema)
}

/**
 * Valida si una URL de playback existe haciendo una petición HEAD.
 * Si devuelve 404, intenta ajustar el start hacia adelante en incrementos de 200ms.
 * Útil para sesiones sin hooks donde el offset puede no ser preciso.
 */
export async function probePlaybackUrl(
  baseUrl: string,
  path: string,
  startDate: Date,
  duration: number,
  maxRetries = 5,
): Promise<{ url: string; adjustedStart: string } | null> {
  const retryDelayMs = 200 // Incremento de ajuste por reintento

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const adjustedStart = new Date(startDate.getTime() + attempt * retryDelayMs)
    const url = new URL('/get', baseUrl)
    url.searchParams.set('path', path)
    url.searchParams.set('start', adjustedStart.toISOString())
    url.searchParams.set('duration', `${duration}s`)
    url.searchParams.set('format', 'mp4')

    try {
      const response = await fetch(url.toString(), { method: 'HEAD' })

      if (response.ok) {
        if (attempt > 0) {
          console.log(
            `[probePlaybackUrl] Found valid start after ${attempt} retries: ${adjustedStart.toISOString()}`,
          )
        }
        return { url: url.toString(), adjustedStart: adjustedStart.toISOString() }
      }

      if (response.status === 404 && attempt < maxRetries - 1) {
        console.warn(
          `[probePlaybackUrl] 404 on attempt ${attempt + 1}, retrying with +${retryDelayMs}ms...`,
        )
        continue
      }

      // Otros errores (403, 500, etc.) no son recuperables con reintentos
      if (response.status !== 404) {
        console.error(`[probePlaybackUrl] Non-404 error: ${response.status}`)
        return null
      }
    } catch (error) {
      console.error(`[probePlaybackUrl] Network error on attempt ${attempt + 1}:`, error)
      if (attempt === maxRetries - 1) {
        return null
      }
    }
  }

  console.error(`[probePlaybackUrl] Max retries (${maxRetries}) exceeded`)
  return null
}

/**
 * Construye la URL de playback para una sesión basándose en sus timestamps.
 * Usa media_start_ts como ancla si existe, de lo contrario usa start_ts + offset.
 */
export const buildPlaybackUrl = (session: SessionSummary): ClipInfo | null => {
  if (!session.end_ts) {
    return null // Sesión abierta, no se puede reproducir
  }

  const startDate = new Date(session.start_ts)
  const endDate = new Date(session.end_ts)

  // Determinar ancla de inicio
  let anchorDate: Date
  let anchorSource: string

  if (session.media_start_ts) {
    // Usar timestamp del primer segmento de MediaMTX (fuente de verdad)
    anchorDate = new Date(session.media_start_ts)
    // Aplicar offset recomendado si existe (normalmente 0)
    if (session.recommended_start_offset_ms) {
      anchorDate = new Date(anchorDate.getTime() + session.recommended_start_offset_ms)
    }
    anchorSource = 'media_start_ts'
  } else {
    // Fallback: usar start_ts con offset por defecto
    const defaultOffset = parseInt(import.meta.env.VITE_START_OFFSET_MS || '200', 10)
    anchorDate = new Date(startDate.getTime() + defaultOffset)
    anchorSource = 'fallback_offset'
  }

  // Determinar ancla de fin: usar media_end_ts si existe
  let endAnchorDate: Date
  if (session.media_end_ts) {
    endAnchorDate = new Date(session.media_end_ts)
  } else {
    endAnchorDate = endDate
  }

  // Calcular duración desde ancla de inicio hasta ancla de fin
  const durationMs = Math.max(0, endAnchorDate.getTime() - anchorDate.getTime())
  const baseSeconds = Math.ceil(durationMs / 1000)
  const extraSeconds = Math.max(
    parseInt(import.meta.env.VITE_EXTRA_SECONDS || '5', 10),
    session.postroll_sec ?? 0,
  )
  const totalSeconds = Math.max(1, baseSeconds + extraSeconds)

  // Construir URL
  const url = new URL('/get', MEDIAMTX_BASE_URL)
  url.searchParams.set('path', session.path ?? session.device_id)
  url.searchParams.set('start', anchorDate.toISOString())
  url.searchParams.set('duration', `${totalSeconds}s`)
  url.searchParams.set('format', 'mp4')

  // Log para debugging
  console.log(
    JSON.stringify({
      event: 'buildPlaybackUrl',
      sessionId: session.session_id,
      anchorSource,
      start: anchorDate.toISOString(),
      end: endAnchorDate.toISOString(),
      duration: totalSeconds,
      has_media_start_ts: !!session.media_start_ts,
      has_media_end_ts: !!session.media_end_ts,
    }),
  )

  return {
    playbackUrl: url.toString(),
    start: anchorDate.toISOString(),
    duration: totalSeconds,
    format: 'mp4',
    anchorSource,
  }
}
