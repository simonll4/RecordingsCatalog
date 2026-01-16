/**
 * HTTP Client Base
 * Provides common HTTP functionality and error handling
 */

import { z } from 'zod'

/**
 * Custom HTTP Error class with status and body information
 */
export class HttpError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `HTTP ${status}`)
    this.status = status
    this.body = body
  }
}

/**
 * HTTP Client configuration
 */
export interface HttpClientConfig {
  baseURL: string
  headers?: Record<string, string>
  timeout?: number
}

/**
 * Request options for individual requests
 */
export interface RequestOptions {
  headers?: Record<string, string>
  params?: Record<string, string | number | boolean | undefined>
  timeout?: number
  signal?: AbortSignal
  expectedStatuses?: number[]
}

/**
 * Parse error response body
 */
const parseErrorBody = async (response: Response): Promise<unknown> => {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Build URL with query parameters
 */
const buildUrl = (baseURL: string, path: string, params?: Record<string, string | number | boolean | undefined>): URL => {
  const url = new URL(path, baseURL.endsWith('/') ? baseURL : `${baseURL}/`)
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, String(value))
      }
    })
  }
  
  return url
}

/**
 * HTTP Client Class
 */
export class HttpClient {
  private config: HttpClientConfig

  constructor(config: HttpClientConfig) {
    this.config = {
      ...config,
      baseURL: config.baseURL.replace(/\/$/, ''), // Remove trailing slash
    }
  }

  /**
   * Perform a GET request with JSON response
   */
  async getJson<T>(
    path: string,
    schema: z.ZodSchema<T>,
    options?: RequestOptions
  ): Promise<T> {
    const url = buildUrl(this.config.baseURL, path, options?.params)
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        ...this.config.headers,
        ...options?.headers,
      },
      signal: options?.signal,
    })

    const expected = options?.expectedStatuses
    const acceptedStatuses = expected?.length ? expected : [200]

    if (!acceptedStatuses.includes(response.status)) {
      const body = await parseErrorBody(response)
      throw new HttpError(
        response.status,
        body,
        `Request failed (${response.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`
      )
    }

    const payload = await response.json()
    return schema.parse(payload)
  }

  private async sendJson<T>(
    method: 'POST' | 'PUT',
    path: string,
    body: unknown,
    schema: z.ZodSchema<T>,
    options?: RequestOptions
  ): Promise<T> {
    const url = buildUrl(this.config.baseURL, path, options?.params)

    const response = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
        ...options?.headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options?.signal,
    })

    const expected = options?.expectedStatuses
    const acceptedStatuses = expected?.length ? expected : [200, 201, 202]

    if (!acceptedStatuses.includes(response.status)) {
      const errorBody = await parseErrorBody(response)
      throw new HttpError(
        response.status,
        errorBody,
        `Request failed (${response.status}): ${typeof errorBody === 'string' ? errorBody : JSON.stringify(errorBody)}`
      )
    }

    const text = await response.text()
    const payload = text ? JSON.parse(text) : null
    return schema.parse(payload)
  }

  async postJson<T>(
    path: string,
    body: unknown,
    schema: z.ZodSchema<T>,
    options?: RequestOptions
  ): Promise<T> {
    return this.sendJson('POST', path, body, schema, options)
  }

  async putJson<T>(
    path: string,
    body: unknown,
    schema: z.ZodSchema<T>,
    options?: RequestOptions
  ): Promise<T> {
    return this.sendJson('PUT', path, body, schema, options)
  }

  /**
   * Perform a GET request with raw response
   */
  async getRaw(
    path: string,
    options?: RequestOptions
  ): Promise<Response> {
    const url = buildUrl(this.config.baseURL, path, options?.params)
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        ...this.config.headers,
        ...options?.headers,
      },
      signal: options?.signal,
    })

    if (!response.ok) {
      const body = await parseErrorBody(response)
      throw new HttpError(
        response.status,
        body,
        `Request failed (${response.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`
      )
    }

    return response
  }

  /**
   * Perform a HEAD request to check if resource exists
   */
  async head(
    path: string,
    options?: RequestOptions
  ): Promise<boolean> {
    const url = buildUrl(this.config.baseURL, path, options?.params)
    
    try {
      const response = await fetch(url.toString(), {
        method: 'HEAD',
        headers: {
          ...this.config.headers,
          ...options?.headers,
        },
        signal: options?.signal,
      })
      
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Get full URL for a path
   */
  getUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    return buildUrl(this.config.baseURL, path, params).toString()
  }
}
