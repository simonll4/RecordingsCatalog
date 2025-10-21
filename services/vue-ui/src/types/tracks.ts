/**
 * Objeto detectado en una frame (como viene en el NDJSON original).
 */
export interface TrackObject {
  track_id: number
  cls: number
  cls_name: string
  conf: number
  bbox_xyxy: [number, number, number, number]
}

/** Evento de tracking en tiempo relativo dentro de un segmento */
export interface TrackEvent {
  t_rel_s: number
  frame: number
  objs: TrackObject[]
}

/**
 * Metadata de la sesión (meta.json) con información de video y clases.
 */
export interface TrackMeta {
  session_id: string
  device_id: string
  start_time: string
  end_time: string | null
  frame_count: number
  fps: number
  path?: string | null
  video: {
    width: number | null
    height: number | null
    fps: number | null
  }
  classes: Array<{ id: number; name: string }>
}

/** Información por segmento dentro de index.json */
export interface TrackSegmentInfo {
  i: number
  t0: number
  t1: number
  url: string
  count: number
  closed?: boolean
}

/** Estructura del index.json (duración de segmento, lista de segmentos, fps, etc.) */
export interface TrackIndex {
  segment_duration_s: number
  segments: TrackSegmentInfo[]
  fps: number
  duration_s: number
}

export interface FetchedSegment {
  buffer: ArrayBuffer
  encoding: string | null
  segment: TrackSegmentInfo | null
}

/** Estructura usada por el renderer (normalizada) */
export interface RenderObject {
  trackId: number
  cls: number
  clsName: string
  conf: number
  bbox: [number, number, number, number]
  time: number
}

export interface RenderFrame {
  time: number
  objects: RenderObject[]
  trails: Map<number, RenderObject[]>
}
