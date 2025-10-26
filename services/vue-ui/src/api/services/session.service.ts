/**
 * Session Service
 * Handles all session-related API operations
 */

import { sessionStoreClient, HttpError } from '../http'
import { 
  SESSION_ENDPOINTS, 
  API_HEADERS,
  QUERY_PARAMS 
} from '@/constants'
import {
  sessionSummarySchema,
  rangeSessionsSchema,
  listSessionsSchema,
  type SessionSummary,
} from '../schemas/session.schemas'

/**
 * Session list parameters
 */
export interface ListSessionsParams {
  mode?: 'range' | 'all'
  limit?: number
  from?: string
  to?: string
}

/**
 * Session list response
 */
export interface ListSessionsResponse {
  mode: 'range' | 'all'
  sessions: SessionSummary[]
  from?: string
  to?: string
}

/**
 * Segment fetch result
 */
export interface SegmentFetchResult {
  buffer: ArrayBuffer
  encoding: string | null
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
    if (params.mode === 'all') {
      const data = await sessionStoreClient.getJson(
        SESSION_ENDPOINTS.LIST,
        listSessionsSchema,
        {
          params: params.limit ? { [QUERY_PARAMS.LIMIT]: params.limit } : undefined,
        }
      )
      
      return {
        mode: 'all',
        sessions: data.sessions,
      }
    }

    // Default to range mode
    const queryParams: Record<string, string | number | undefined> = {}
    if (params.limit) queryParams[QUERY_PARAMS.LIMIT] = params.limit
    if (params.from) queryParams[QUERY_PARAMS.FROM] = params.from
    if (params.to) queryParams[QUERY_PARAMS.TO] = params.to
    
    const data = await sessionStoreClient.getJson(
      SESSION_ENDPOINTS.LIST_RANGE,
      rangeSessionsSchema,
      { params: queryParams }
    )
    
    return {
      mode: 'range',
      sessions: data.sessions,
      from: data.from,
      to: data.to,
    }
  }

  /**
   * Get session details
   */
  async getSession(sessionId: string): Promise<SessionSummary> {
    return sessionStoreClient.getJson(
      SESSION_ENDPOINTS.DETAILS(sessionId),
      sessionSummarySchema
    )
  }


  /**
   * Fetch track meta for a session
   */
  async getTrackMeta(sessionId: string): Promise<any> {
    const response = await sessionStoreClient.getRaw(
      SESSION_ENDPOINTS.TRACK_META(sessionId)
    )
    return response.json()
  }

  /**
   * Fetch track index for a session
   */
  async getTrackIndex(sessionId: string): Promise<any> {
    const response = await sessionStoreClient.getRaw(
      SESSION_ENDPOINTS.TRACK_INDEX(sessionId)
    )
    return response.json()
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
