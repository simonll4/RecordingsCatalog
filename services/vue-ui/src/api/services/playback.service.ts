/**
 * Playback Service
 * Handles video playback URL generation and validation
 */

import { mediamtxClient, BASE_URLS } from '../http'
import { 
  MEDIAMTX_ENDPOINTS, 
  QUERY_PARAMS,
  PLAYER_CONFIG,
  ENV_CONFIG 
} from '@/constants'
import type { SessionSummary } from '../schemas/session.schemas'
import type { PlaybackInfo } from '../../types/tracks'

/**
 * Playback URL result
 */
export interface PlaybackUrlResult {
  url: string
  adjustedStart: string
}

// Re-export PlaybackInfo for convenience
export type { PlaybackInfo }

/**
 * Playback Service Class
 * Handles all playback-related operations
 */
export class PlaybackService {
  /**
   * Build MediaMTX GET URL from query parameters
   */
  buildMediaMtxUrl(queryString: string): string {
    const base = new URL(BASE_URLS.MEDIAMTX)
    base.pathname = MEDIAMTX_ENDPOINTS.GET
    base.search = queryString
    return base.toString()
  }

  /**
   * Build playback URL for a session based on its timestamps
   */
  buildSessionPlaybackUrl(session: SessionSummary): PlaybackInfo | null {
    if (!session.end_ts) {
      return null // Open session, cannot playback
    }

    const startDate = new Date(session.start_ts)
    const endDate = new Date(session.end_ts)

    // Determine start anchor
    let anchorDate: Date
    let anchorSource: string

    if (session.media_start_ts) {
      // Use MediaMTX first segment timestamp (source of truth)
      anchorDate = new Date(session.media_start_ts)
      
      // Apply recommended offset if exists (usually 0)
      if (session.recommended_start_offset_ms) {
        anchorDate = new Date(anchorDate.getTime() + session.recommended_start_offset_ms)
      }
      anchorSource = 'media_start_ts'
    } else {
      // Fallback: use start_ts with default offset
      const defaultOffset = ENV_CONFIG.START_OFFSET_MS
      anchorDate = new Date(startDate.getTime() + defaultOffset)
      anchorSource = 'fallback_offset'
    }

    // Determine end anchor
    let endAnchorDate: Date
    if (session.media_end_ts) {
      endAnchorDate = new Date(session.media_end_ts)
    } else {
      endAnchorDate = endDate
    }

    // Calculate duration
    const durationMs = Math.max(0, endAnchorDate.getTime() - anchorDate.getTime())
    const baseSeconds = Math.ceil(durationMs / 1000)
    const extraSeconds = Math.max(
      ENV_CONFIG.EXTRA_SECONDS,
      session.postroll_sec ?? 0
    )
    const totalSeconds = Math.max(1, baseSeconds + extraSeconds)

    // Build URL
    const url = mediamtxClient.getUrl(MEDIAMTX_ENDPOINTS.GET, {
      [QUERY_PARAMS.PATH]: session.path ?? session.device_id,
      [QUERY_PARAMS.START]: anchorDate.toISOString(),
      [QUERY_PARAMS.DURATION]: `${totalSeconds}s`,
      [QUERY_PARAMS.FORMAT]: PLAYER_CONFIG.DEFAULT_FORMAT,
    })

    // Log for debugging
    console.log(
      JSON.stringify({
        event: 'buildSessionPlaybackUrl',
        sessionId: session.session_id,
        anchorSource,
        start: anchorDate.toISOString(),
        end: endAnchorDate.toISOString(),
        duration: totalSeconds,
        has_media_start_ts: !!session.media_start_ts,
        has_media_end_ts: !!session.media_end_ts,
      })
    )

    return {
      playbackUrl: url,
      start: anchorDate.toISOString(),
      duration: totalSeconds,
      format: PLAYER_CONFIG.DEFAULT_FORMAT,
      anchorSource,
    }
  }

  /**
   * Probe playback URL existence with retry logic
   * Useful for sessions without hooks where the offset may not be precise
   */
  async probePlaybackUrl(
    path: string,
    startDate: Date,
    duration: number,
    maxRetries?: number
  ): Promise<PlaybackUrlResult | null> {
    const retryDelayMs = PLAYER_CONFIG.RETRY.DELAY_MS
    const maxAttempts = maxRetries ?? PLAYER_CONFIG.RETRY.MAX_ATTEMPTS

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const adjustedStart = new Date(startDate.getTime() + attempt * retryDelayMs)
      
      const url = mediamtxClient.getUrl(MEDIAMTX_ENDPOINTS.GET, {
        [QUERY_PARAMS.PATH]: path,
        [QUERY_PARAMS.START]: adjustedStart.toISOString(),
        [QUERY_PARAMS.DURATION]: `${duration}s`,
        [QUERY_PARAMS.FORMAT]: PLAYER_CONFIG.DEFAULT_FORMAT,
      })

      try {
        const exists = await mediamtxClient.head(MEDIAMTX_ENDPOINTS.GET, {
          params: {
            [QUERY_PARAMS.PATH]: path,
            [QUERY_PARAMS.START]: adjustedStart.toISOString(),
            [QUERY_PARAMS.DURATION]: `${duration}s`,
            [QUERY_PARAMS.FORMAT]: PLAYER_CONFIG.DEFAULT_FORMAT,
          }
        })

        if (exists) {
          if (attempt > 0) {
            console.log(
              `[probePlaybackUrl] Found valid start after ${attempt} retries: ${adjustedStart.toISOString()}`
            )
          }
          return { 
            url, 
            adjustedStart: adjustedStart.toISOString() 
          }
        }

        if (attempt < maxAttempts - 1) {
          console.warn(
            `[probePlaybackUrl] Not found on attempt ${attempt + 1}, retrying with +${retryDelayMs}ms...`
          )
        }
      } catch (error) {
        console.error(`[probePlaybackUrl] Error on attempt ${attempt + 1}:`, error)
        if (attempt === maxAttempts - 1) {
          return null
        }
      }
    }

    console.error(`[probePlaybackUrl] Max retries (${maxAttempts}) exceeded`)
    return null
  }
}

// Export singleton instance
export const playbackService = new PlaybackService()
