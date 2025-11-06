/**
 * Kalman Filter state (opcional, v2)
 */
export interface KalmanFilterState {
  bbox_smooth?: [number, number, number, number]  // bbox suavizado por KF
  bbox_pred?: [number, number, number, number]    // predicción del próximo frame
  velocity?: [number, number]                      // velocidad [vx, vy]
}

/**
 * Track metadata (opcional, v2)
 */
export interface TrackMetadata {
  age: number              // frames desde creación del track
  hits: number             // total de detecciones asociadas
  hit_streak: number       // frames consecutivos con detección
  time_since_update: number // frames desde última detección
  state: 'tentative' | 'confirmed' | 'deleted'  // estado del track
}

/**
 * Objeto detectado en una frame (como viene en el NDJSON original).
 * 
 * V1: Campos base (siempre presentes)
 * V2: Campos extendidos opcionales (kf_state, track_meta)
 */
export interface TrackObject {
  // V1 - Base fields (backward compatible)
  track_id: number
  cls: number
  cls_name: string
  conf: number
  bbox_xyxy: [number, number, number, number]
  
  // V2 - Extended fields (optional)
  kf_state?: KalmanFilterState
  track_meta?: TrackMetadata
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
  video?: {
    width: number | null
    height: number | null
    fps: number | null
  } | null
  classes?: Array<{ id: number; name: string }>
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

/** Playback information for a session */
export interface PlaybackInfo {
  playbackUrl: string
  start: string
  duration: number
  format: string
  anchorSource?: string
}
