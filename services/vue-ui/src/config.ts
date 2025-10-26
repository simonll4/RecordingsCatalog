/**
 * Configuration - Compatibility Layer
 * @deprecated Use imports from '@/constants' instead
 * This file maintains backward compatibility
 */

import { BASE_URLS } from './api/http/factory'
import { MEDIAMTX_ENDPOINTS } from './constants'

// Re-export for backward compatibility
export const SESSION_STORE_BASE_URL = BASE_URLS.SESSION_STORE
export const MEDIAMTX_BASE_URL = BASE_URLS.MEDIAMTX

/**
 * @deprecated Use playbackService.buildMediaMtxUrl() instead
 */
export const mediamtxGetUrl = (search: string): string => {
  const base = new URL(MEDIAMTX_BASE_URL)
  base.pathname = MEDIAMTX_ENDPOINTS.GET
  base.search = search
  return base.toString()
}
