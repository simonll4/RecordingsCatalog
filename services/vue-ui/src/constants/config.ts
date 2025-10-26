/**
 * Application Configuration Constants
 * Centralizes all configuration values
 */

// Player Configuration
export const PLAYER_CONFIG = {
  // Retry configuration for playback
  RETRY: {
    MAX_ATTEMPTS: 5,
    DELAY_MS: 200,
  },
  
  // Video format
  DEFAULT_FORMAT: 'mp4',
  
  // Timing adjustments
  DEFAULT_START_OFFSET_MS: 200,
  DEFAULT_EXTRA_SECONDS: 5,
} as const

// Segment Configuration
export const SEGMENT_CONFIG = {
  MAX_SEGMENTS_IN_MEMORY: 12,
  EVENT_WINDOW_SECONDS: 0.2,
  TRAIL_WINDOW_SECONDS: 2.0,
} as const

// UI Configuration
export const UI_CONFIG = {
  // Default filter values
  FILTERS: {
    DEFAULT_CONFIDENCE_MIN: 0.4,
    DEFAULT_SHOW_BOXES: true,
    DEFAULT_SHOW_LABELS: true,
    DEFAULT_SHOW_TRAILS: false,
  },
  
  // Canvas rendering
  CANVAS: {
    BOX_COLOR: 'rgba(255, 255, 255, 0.8)',
    TRAIL_COLOR: 'rgba(255, 255, 255, 0.4)',
    LABEL_FONT: '12px monospace',
    LABEL_PADDING: 4,
  },
} as const

// Environment Configuration
export const ENV_CONFIG = {
  // Get environment variables with defaults
  START_OFFSET_MS: parseInt(import.meta.env.VITE_START_OFFSET_MS || '200', 10),
  EXTRA_SECONDS: parseInt(import.meta.env.VITE_EXTRA_SECONDS || '5', 10),
  SESSION_STORE_BASE_URL: import.meta.env.VITE_SESSION_STORE_BASE_URL,
  MEDIAMTX_BASE_URL: import.meta.env.VITE_MEDIAMTX_BASE_URL,
} as const

// Service URLs Configuration
export const SERVICE_URLS = {
  // Default ports for services
  DEFAULT_PORTS: {
    SESSION_STORE: 8080,
    MEDIAMTX: 9996,
  },
} as const
