/**
 * Session Service
 * Handles all session-related API operations
 */

import { sessionStoreClient } from '../http'
import { 
  SESSION_ENDPOINTS, 
  QUERY_PARAMS 
} from '@/constants'
import {
  sessionSummarySchema,
  rangeSessionsSchema,
  listSessionsSchema,
  trackMetaSchema,
  trackIndexSchema,
  type SessionSummary,
  type TrackMeta,
  type TrackIndex,
} from '../schemas/session.schemas'

/**
 * Session list parameters
 */
export interface ListSessionsParams {
  mode?: 'range' | 'all'
  limit?: number
  from?: string
  to?: string
  classes?: string[]
  color?: string
}

/**
 * Session list response
 */
export interface ListSessionsResponse {
  mode: 'range' | 'all'
  sessions: SessionSummary[]
  from?: string
  to?: string
  classes?: string[]
  color?: string
}

/**
 * Session Service Class
 * Encapsulates all session-related API calls
 */
export class SessionService {
  /**
   * List sessions from the session store
   */
  async listSessions(params: ListSessionsParams = {}): Promise<ListSessionsResponse> {
    const mode = params.mode ?? 'all'

    if (mode === 'all') {
      const data = await sessionStoreClient.getJson(
        SESSION_ENDPOINTS.LIST,
        listSessionsSchema,
        params.limit ? { params: { [QUERY_PARAMS.LIMIT]: params.limit } } : undefined
      )
      
      return {
        mode: 'all',
        sessions: data.sessions.map(s => ({
          ...s,
          detected_classes: s.detected_classes ?? []
        })),
      }
    }

    // Default to range mode
    if (!params.from || !params.to) {
      throw new Error('listSessions in "range" mode requires both "from" and "to" ISO timestamps')
    }

    const queryParams: Record<string, string | number> = {
      [QUERY_PARAMS.FROM]: params.from,
      [QUERY_PARAMS.TO]: params.to,
    }
    if (params.limit) {
      queryParams[QUERY_PARAMS.LIMIT] = params.limit
    }
    if (params.classes && params.classes.length > 0) {
      queryParams['classes'] = params.classes.join(',')
    }
    if (params.color) {
      queryParams['color'] = params.color
    }
    
    const data = await sessionStoreClient.getJson(
      SESSION_ENDPOINTS.LIST_RANGE,
      rangeSessionsSchema,
      { params: queryParams }
    )
    
    return {
      mode: 'range',
      sessions: data.sessions.map(s => ({
        ...s,
        detected_classes: s.detected_classes ?? []
      })),
      from: data.from,
      to: data.to,
      classes: data.classes,
      color: data.color,
    }
  }

  /**
   * Get session details
   */
  async getSession(sessionId: string): Promise<SessionSummary> {
    const session = await sessionStoreClient.getJson(
      SESSION_ENDPOINTS.DETAILS(sessionId),
      sessionSummarySchema
    )
    return {
      ...session,
      detected_classes: session.detected_classes ?? []
    }
  }


  /**
   * Fetch track meta for a session
   */
  async getTrackMeta(sessionId: string): Promise<TrackMeta> {
    const data = await sessionStoreClient.getJson(
      SESSION_ENDPOINTS.TRACK_META(sessionId),
      trackMetaSchema
    )

    const video = data.video ?? { width: null, height: null, fps: null }

    return {
      ...data,
      video: {
        width: video.width ?? null,
        height: video.height ?? null,
        fps: video.fps ?? null,
      },
      classes: data.classes ?? [],
    }
  }

  /**
   * Fetch track index for a session
   */
  async getTrackIndex(sessionId: string): Promise<TrackIndex> {
    return sessionStoreClient.getJson(
      SESSION_ENDPOINTS.TRACK_INDEX(sessionId),
      trackIndexSchema
    )
  }

  /**
   * Fetch a specific track segment for a session
   */
  async getTrackSegment(sessionId: string, segment: string): Promise<Blob> {
    const response = await sessionStoreClient.getRaw(
      SESSION_ENDPOINTS.TRACK_SEGMENT(sessionId, segment)
    )
    return response.blob()
  }

  /**
   * Check if a session exists
   */
  async sessionExists(sessionId: string): Promise<boolean> {
    return sessionStoreClient.head(SESSION_ENDPOINTS.DETAILS(sessionId))
  }
}

// Export singleton instance
export const sessionService = new SessionService()
