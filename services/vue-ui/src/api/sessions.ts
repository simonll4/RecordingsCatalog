/**
 * Sessions API - Compatibility Layer
 * This file maintains backward compatibility by re-exporting from sessions-legacy
 * Gradually migrate to use the new modular services from api/services
 */

// Re-export everything from legacy for backward compatibility
export * from './sessions-legacy'

// Also export new services for gradual migration
export { sessionService, playbackService } from './services'
