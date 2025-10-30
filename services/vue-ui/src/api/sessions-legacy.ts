/**
 * Legacy Sessions API
 * This file provides backward compatibility with the old API structure
 * It wraps the new modular services to maintain the existing interface
 * 
 * @deprecated Use the new modular services directly from api/services
 */

import { sessionService, playbackService } from './services'
import type { 
  SessionSummary,
  TrackMeta,
} from './schemas/session.schemas'
import type { TrackIndex } from '../types/tracks'

// Re-export types for backward compatibility
export type { SessionSummary }
export { HttpError } from './http'

/**
 * @deprecated Use sessionService.listSessions() directly
 */
export const listSessions = async (
  params: { mode?: 'range' | 'all'; limit?: number; from?: string; to?: string } = {}
) => {
  return sessionService.listSessions(params)
}

/**
 * @deprecated Use sessionService.getTrackMeta() directly
 */
export const fetchSessionMeta = async (sessionId: string): Promise<TrackMeta> => {
  return sessionService.getTrackMeta(sessionId)
}


/**
 * @deprecated Use sessionService.getTrackIndex() directly
 */
export const fetchSessionIndex = async (sessionId: string): Promise<TrackIndex | null> => {
  return sessionService.getTrackIndex(sessionId)
}

/**
 * @deprecated Use sessionService.getTrackSegment() directly
 */
export const fetchSessionSegment = async (
  sessionId: string,
  segment: string
) => {
  return sessionService.getTrackSegment(sessionId, segment)
}

/**
 * @deprecated Use sessionService.getSession() directly
 */
export const fetchSession = async (sessionId: string): Promise<SessionSummary> => {
  return sessionService.getSession(sessionId)
}

/**
 * @deprecated Use playbackService.probePlaybackUrl() directly
 */
export const probePlaybackUrl = async (
  baseUrl: string,
  path: string,
  startDate: Date,
  duration: number,
  maxRetries?: number
) => {
  // Note: baseUrl parameter is ignored as it's now configured globally
  return playbackService.probePlaybackUrl(path, startDate, duration, maxRetries)
}

/**
 * @deprecated Use playbackService.buildSessionPlaybackUrl() directly
 */
export const buildPlaybackUrl = (session: SessionSummary) => {
  return playbackService.buildSessionPlaybackUrl(session)
}
