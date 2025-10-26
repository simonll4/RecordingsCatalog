/**
 * API Module Index
 * Central export point for all API-related functionality
 */

// Export services
export * from './services'

// Export HTTP client utilities
export { HttpError, HttpClient, type HttpClientConfig, type RequestOptions } from './http'

// Export schemas and types
export * from './schemas/session.schemas'

// Export legacy compatibility (for gradual migration)
export * as SessionsLegacy from './sessions-legacy'
