import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { wrap } from 'comlink'
import type { TrackEvent, TrackIndex, TrackMeta, RenderObject } from '../types/tracks'
import {
  fetchSessionIndex,
  fetchSessionMeta,
  fetchSessionSegment,
  HttpError,
} from '../api/sessions'
import { segmentCache } from './segmentCache'

interface NdjsonParser {
  parseSegment(data: ArrayBuffer, encoding: string | null): Promise<TrackEvent[]>
}

const MAX_SEGMENTS_IN_MEMORY = 12
const EVENT_WINDOW_SECONDS = 0.2
const TRAIL_WINDOW_SECONDS = 2.0

/**
 * Interfaz del worker expuesto por `ndjsonParser.worker.ts`.
 * El worker parsea buffers NDJSON a `TrackEvent[]`.
 */
interface NdjsonParser {
  parseSegment(data: ArrayBuffer, encoding: string | null): Promise<TrackEvent[]>
}

// Worker que parsea NDJSON en segundo plano para no bloquear el hilo principal
const parserWorker = new Worker(new URL('../workers/ndjsonParser.worker.ts', import.meta.url), {
  type: 'module',
})
const parser = wrap<NdjsonParser>(parserWorker)

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/**
 * Store de tracks y segmentos:
 * - Mantiene `meta` e `index` de la sesión.
 * - Gestiona la descarga, parseo (worker) y cache (Dexie) de segmentos NDJSON.
 * - Provee utilidades para obtener eventos a un tiempo dado y manejar LRU.
 */
export const useTracksStore = defineStore('tracks', () => {
  const meta = ref<TrackMeta | null>(null)
  const index = ref<TrackIndex | null>(null)
  const sessionId = ref<string | null>(null)

  // Map de segmentIndex -> TrackEvent[] (en memoria)
  const segmentEvents = ref<Map<number, TrackEvent[]>>(new Map())
  const loadingSegments = ref<Set<number>>(new Set())
  const lru = ref<number[]>([])
  const error = ref<string | null>(null)
  const metaMissing = ref(false)
  const indexMissing = ref(false)

  // Compensación temporal: diferencia en segundos entre video start y meta.start_time
  const overlayShiftSeconds = ref(0)

  // UI state / filtros
  const confMin = ref(0.4)
  const showBoxes = ref(true)
  const showLabels = ref(true)
  const showTrails = ref(false)
  const selectedClasses = ref<Set<number>>(new Set())

  const availableClasses = computed(() => meta.value?.classes ?? [])
  const hasSegments = computed(() => index.value !== null && !indexMissing.value)

  /**
   * Resetea el store para una nueva sesión:
   * - Limpia meta/index, eventos en memoria, LRU y cache local para la sesión.
   */
  const resetForSession = async (id: string) => {
    if (sessionId.value === id) {
      return
    }
    sessionId.value = id
    meta.value = null
    index.value = null
    segmentEvents.value = new Map()
    loadingSegments.value = new Set()
    lru.value = []
    error.value = null
    metaMissing.value = false
    indexMissing.value = false
    overlayShiftSeconds.value = 0
    selectedClasses.value = new Set()
    await segmentCache.clearSession(id)
  }

  /** Carga meta.json; si no existe (404) marca metaMissing */
  const loadMeta = async (id: string) => {
    try {
      const result = await fetchSessionMeta(id)
      if (result) {
        meta.value = result
        metaMissing.value = false
      } else {
        meta.value = null
        metaMissing.value = true
      }
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        meta.value = null
        metaMissing.value = true
        return
      }
      console.error('Failed to load session meta', err)
      error.value = err instanceof Error ? err.message : 'Failed to load meta'
      throw err
    }
  }

  /** Carga index.json; si no existe (404) marca indexMissing */
  const loadIndex = async (id: string) => {
    try {
      const result = await fetchSessionIndex(id)
      if (result) {
        index.value = result
        indexMissing.value = false
      } else {
        index.value = null
        indexMissing.value = true
      }
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        index.value = null
        indexMissing.value = true
        return
      }
      console.error('Failed to load session index', err)
      error.value = err instanceof Error ? err.message : 'Failed to load index'
      throw err
    }
  }

  // Marca un segmento como en carga para evitar cargas duplicadas
  const markSegmentLoading = (segmentIndex: number, value: boolean) => {
    const next = new Set(loadingSegments.value)
    if (value) {
      next.add(segmentIndex)
    } else {
      next.delete(segmentIndex)
    }
    loadingSegments.value = next
  }

  // LRU: touch -> mueve el índice al final; si excede límite, expulsa antiguos
  const touchSegment = (segmentIndex: number) => {
    const filtered = lru.value.filter((idx) => idx !== segmentIndex)
    filtered.push(segmentIndex)
    lru.value = filtered
    if (filtered.length > MAX_SEGMENTS_IN_MEMORY) {
      const overflow = filtered.length - MAX_SEGMENTS_IN_MEMORY
      const currentMap = new Map(segmentEvents.value)
      for (let i = 0; i < overflow; i += 1) {
        const evicted = filtered.shift()
        if (evicted === undefined) {
          break
        }
        currentMap.delete(evicted)
      }
      lru.value = filtered
      segmentEvents.value = currentMap
    }
  }

  const setSegmentEvents = (segmentIndex: number, events: TrackEvent[]) => {
    const nextMap = new Map(segmentEvents.value)
    nextMap.set(segmentIndex, events)
    segmentEvents.value = nextMap
    touchSegment(segmentIndex)
  }

  /**
   * Garantiza que un segmento esté cargado en memoria:
   * - Si ya está en `segmentEvents` simplemente toca LRU.
   * - Si está en cache (Dexie) lo usa.
   * - Si no, lo descarga, lo parsea (worker) y lo guarda en memoria y cache.
   */
  const ensureSegment = async (id: string, segmentIndex: number) => {
    if (!index.value || indexMissing.value) return
    if (segmentEvents.value.has(segmentIndex)) {
      touchSegment(segmentIndex)
      return
    }
    if (loadingSegments.value.has(segmentIndex)) {
      return
    }

    markSegmentLoading(segmentIndex, true)
    try {
      const cached = await segmentCache.get(id, segmentIndex)
      if (cached) {
        setSegmentEvents(segmentIndex, cached.events)
        return
      }

      const { buffer, encoding } = await fetchSessionSegment(id, segmentIndex)
      const events = await parser.parseSegment(buffer, encoding ?? null)
      setSegmentEvents(segmentIndex, events)

      const segmentInfo = index.value.segments.find((entry) => entry.i === segmentIndex)
      await segmentCache.put(id, segmentIndex, {
        events,
        closed: segmentInfo?.closed ?? false,
      })
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        // Segmento aún no listo; no lo tratamos como error fatal
        console.debug(`Segment ${segmentIndex} not ready yet`)
        return
      }
      console.error(`Failed to load segment ${segmentIndex}`, err)
      error.value = err instanceof Error ? err.message : 'Failed to load segment'
      throw err
    } finally {
      markSegmentLoading(segmentIndex, false)
    }
  }

  /**
   * Prefetch: intenta cargar segmentos vecinos (anterior y siguiente).
   * No bloqueante: errores se loguean en debug.
   */
  const prefetchAround = (segmentIndex: number) => {
    const currentId = sessionId.value
    if (!currentId || !hasSegments.value) return
    const idx = index.value
    const maxSegment = idx?.segments[idx.segments.length - 1]?.i ?? Number.POSITIVE_INFINITY
    const candidates = [segmentIndex - 1, segmentIndex + 1]
    for (const candidate of candidates) {
      if (candidate < 0 || candidate > maxSegment) continue
      void ensureSegment(currentId, candidate).catch((err) => {
        console.debug('Prefetch failure', err)
      })
    }
  }

  const segmentIndexForTime = (time: number): number | null => {
    if (!index.value) return null
    const duration = index.value.segment_duration_s
    if (duration <= 0) return 0
    return Math.floor(time / duration)
  }

  // Aplica filtros (confianza y clases seleccionadas) a un objeto detectado
  const filterObject = (obj: TrackEvent['objs'][number]) => {
    if (obj.conf < confMin.value) {
      return false
    }
    if (selectedClasses.value.size > 0 && !selectedClasses.value.has(obj.cls)) {
      return false
    }
    return true
  }

  /**
   * Devuelve los objetos actuales y las trayectorias (trails) para un tiempo dado.
   * - windowStart/windowEnd definen el rango de interés (eventos cercanos al tiempo)
   * - Filtra por `confMin` y `selectedClasses`
   */
  const eventsAtTime = (
    time: number,
  ): { current: RenderObject[]; trails: Map<number, RenderObject[]> } => {
    if (!index.value) {
      return { current: [], trails: new Map() }
    }
    // Aplicar compensación temporal: el video puede comenzar en un punto distinto a meta.start_time
    const adjustedTime = time + overlayShiftSeconds.value
    const windowStart = Math.max(
      0,
      adjustedTime - (showTrails.value ? TRAIL_WINDOW_SECONDS : EVENT_WINDOW_SECONDS),
    )
    const windowEnd = adjustedTime + EVENT_WINDOW_SECONDS
    const tolerance = EVENT_WINDOW_SECONDS
    const trailWindow = showTrails.value ? TRAIL_WINDOW_SECONDS : 0

    const results: RenderObject[] = []
    const trails = new Map<number, RenderObject[]>()

    const segDuration = index.value.segment_duration_s
    const minSegment = Math.max(0, Math.floor(windowStart / segDuration))
    const maxSegment = Math.floor(windowEnd / segDuration) + 1

    for (const [segmentIdx, events] of segmentEvents.value) {
      if (segmentIdx < minSegment || segmentIdx > maxSegment) {
        continue
      }
      for (const event of events) {
        const eventTime = event.t_rel_s
        if (eventTime < windowStart || eventTime > windowEnd) {
          continue
        }
        for (const obj of event.objs) {
          if (!filterObject(obj)) continue

          // Work with raw bbox values from NDJSON. They are expected to be
          // normalized [0,1], but some backends may provide absolute pixel
          // coordinates. Detect that case and normalize using metadata if
          // available. Keep the original behavior (clamp to [0,1]) otherwise.
          let [x1, y1, x2, y2] = obj.bbox_xyxy
          let normalizedFromPixels = false

          const videoW = meta.value?.video?.width ?? null
          const videoH = meta.value?.video?.height ?? null

          // Heuristic: if any coordinate is > 1.5, they're likely pixels.
          // Only normalize when we have valid video dimensions.
          if ((x1 > 1.5 || x2 > 1.5 || y1 > 1.5 || y2 > 1.5) && videoW && videoH) {
            x1 = x1 / videoW
            x2 = x2 / videoW
            y1 = y1 / videoH
            y2 = y2 / videoH
            normalizedFromPixels = true
          }

          // If values are outside [0,1] and we couldn't normalize (missing
          // meta), log a debug hint so the developer can inspect the NDJSON.
          if (!normalizedFromPixels && (x1 > 1 || x2 > 1 || y1 > 1 || y2 > 1)) {
            // Keep this debug message low-volume: it only fires when malformed
            // bboxes are observed and normalization couldn't be applied.
            console.debug('Unexpected bbox ranges in NDJSON (not normalized) for', {
              sessionId: sessionId.value,
              segmentIdx,
              bbox: obj.bbox_xyxy,
              videoW,
              videoH,
            })
          }

          // Clamp into [0,1] after normalization attempt
          const cx1 = clamp(x1, 0, 1)
          const cy1 = clamp(y1, 0, 1)
          const cx2 = clamp(x2, 0, 1)
          const cy2 = clamp(y2, 0, 1)

          // Discard degenerate boxes where coordinates are not in the
          // expected order. The renderer also performs a similar check,
          // but filtering early avoids creating invalid RenderObjects.
          if (cx1 >= cx2 || cy1 >= cy2) {
            // Optional debug for malformed boxes
            console.debug('Dropping degenerate bbox after normalization/clamp', {
              sessionId: sessionId.value,
              segmentIdx,
              raw: obj.bbox_xyxy,
              clamped: [cx1, cy1, cx2, cy2],
            })
            continue
          }

          const renderItem: RenderObject = {
            trackId: obj.track_id,
            cls: obj.cls,
            clsName: obj.cls_name,
            conf: obj.conf,
            bbox: [cx1, cy1, cx2, cy2],
            time: eventTime,
          }

          if (Math.abs(eventTime - adjustedTime) <= tolerance) {
            results.push(renderItem)
          }

          if (trailWindow > 0 && eventTime <= adjustedTime && eventTime >= adjustedTime - trailWindow) {
            const list = trails.get(renderItem.trackId) ?? []
            list.push(renderItem)
            trails.set(renderItem.trackId, list)
          }
        }
      }
    }

    // Asegurar orden ascendente por tiempo en trails para dibujar correctamente
    for (const [, list] of trails) {
      list.sort((a, b) => a.time - b.time)
    }

    return { current: results, trails }
  }

  const toggleClass = (classId: number) => {
    const next = new Set(selectedClasses.value)
    if (next.has(classId)) {
      next.delete(classId)
    } else {
      next.add(classId)
    }
    selectedClasses.value = next
  }

  const setOverlayShift = (shiftSeconds: number) => {
    overlayShiftSeconds.value = shiftSeconds
  }

  return {
    meta,
    index,
    sessionId,
    segmentEvents,
    loadingSegments,
    error,
    metaMissing,
    indexMissing,
    overlayShiftSeconds,
    confMin,
    showBoxes,
    showLabels,
    showTrails,
    selectedClasses,
    availableClasses,
    hasSegments,
    resetForSession,
    loadMeta,
    loadIndex,
    ensureSegment,
    prefetchAround,
    eventsAtTime,
    segmentIndexForTime,
    toggleClass,
    setOverlayShift,
  }
})
