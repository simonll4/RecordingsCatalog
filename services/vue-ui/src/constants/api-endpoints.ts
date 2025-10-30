/**
 * API Endpoints Constants
 * Centralizes all API paths for easy maintenance and updates
 */

// Base paths for different services
export const API_BASE_PATHS = {
  SESSION_STORE: '/sessions',
  MEDIAMTX: '/get',
} as const

// Session Store Endpoints
export const SESSION_ENDPOINTS = {
  // Session management endpoints
  OPEN: 'open',
  CLOSE: 'close',
  
  // Session list endpoints
  LIST: '',
  LIST_RANGE: 'range',
  
  // Single session endpoints (require sessionId)
  DETAILS: (sessionId: string) => `${encodeURIComponent(sessionId)}`,
  
  // Track data endpoints
  TRACK_META: (sessionId: string) => `${encodeURIComponent(sessionId)}/tracks/meta.json`,
  TRACK_INDEX: (sessionId: string) => `${encodeURIComponent(sessionId)}/tracks/index.json`,
  TRACK_SEGMENT: (sessionId: string, segment: string) => 
    `${encodeURIComponent(sessionId)}/tracks/${encodeURIComponent(segment)}`,
} as const

// MediaMTX Endpoints
export const MEDIAMTX_ENDPOINTS = {
  GET: '/get',
} as const

// HTTP Headers
export const API_HEADERS = {
  JSON: {
    Accept: 'application/json',
  },
  NDJSON: {
    Accept: 'application/x-ndjson',
  },
  STREAM: {
    Accept: 'application/octet-stream',
  },
} as const

// Query parameter keys
export const QUERY_PARAMS = {
  LIMIT: 'limit',
  FROM: 'from',
  TO: 'to',
  PATH: 'path',
  START: 'start',
  DURATION: 'duration',
  FORMAT: 'format',
} as const
