/**
 * Sessions API
 * Retained as a thin shim so existing imports keep working while the
 * application standardises on the new service module structure.
 */

export {
  sessionService,
  playbackService,
  type ListSessionsParams,
  type ListSessionsResponse,
  type PlaybackInfo,
  type PlaybackUrlResult,
} from './services'

export type {
  SessionSummary,
  TrackMeta,
  TrackIndex,
} from './schemas/session.schemas'

export { HttpError } from './http'
