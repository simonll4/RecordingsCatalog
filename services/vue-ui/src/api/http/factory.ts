/**
 * HTTP Client Factory
 * Creates and manages HTTP client instances for different services
 */

import { HttpClient } from './client'
import { API_HEADERS, SERVICE_URLS } from '@/constants'

// Detect host and protocol at runtime
const rawHost = window.location.hostname || 'localhost'
const defaultHost = rawHost === '0.0.0.0' ? '127.0.0.1' : rawHost
const defaultProtocol = window.location.protocol || 'http:'

/**
 * Build service URL with defaults
 */
const buildServiceUrl = (port: number): string => {
  const url = new URL(`${defaultProtocol}//${defaultHost}`)
  url.port = String(port)
  return url.toString()
}

/**
 * Get base URLs from environment or use defaults
 */
const getBaseUrls = () => {
  const sessionStoreUrl = import.meta.env.VITE_SESSION_STORE_BASE_URL || 
    buildServiceUrl(SERVICE_URLS.DEFAULT_PORTS.SESSION_STORE)
  
  const mediamtxUrl = import.meta.env.VITE_MEDIAMTX_BASE_URL || 
    buildServiceUrl(SERVICE_URLS.DEFAULT_PORTS.MEDIAMTX)
  
  return {
    sessionStore: sessionStoreUrl.replace(/\/$/, ''),
    mediamtx: mediamtxUrl.replace(/\/$/, ''),
  }
}

const urls = getBaseUrls()

/**
 * Session Store HTTP Client
 */
export const sessionStoreClient = new HttpClient({
  baseURL: `${urls.sessionStore}/sessions`,
  headers: API_HEADERS.JSON,
})

/**
 * MediaMTX HTTP Client
 */
export const mediamtxClient = new HttpClient({
  baseURL: urls.mediamtx,
  headers: {},
})

/**
 * Export base URLs for direct use when needed
 */
export const BASE_URLS = {
  SESSION_STORE: `${urls.sessionStore}/sessions`,
  MEDIAMTX: urls.mediamtx,
} as const
