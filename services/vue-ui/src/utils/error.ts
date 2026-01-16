/**
 * Error Handling Utilities
 * Helpers for working with errors
 */

import { HttpError } from '@/api'

/**
 * Extract a user-friendly error message from an error object
 */
export const getErrorMessage = (error: unknown): string => {
  if (error instanceof HttpError) {
    return `HTTP ${error.status}: ${typeof error.body === 'string' ? error.body : JSON.stringify(error.body)}`
  }
  
  if (error instanceof Error) {
    return error.message
  }
  
  if (typeof error === 'string') {
    return error
  }
  
  return 'An unexpected error occurred'
}

/**
 * Check if error is a 404 (Not Found)
 */
export const isNotFoundError = (error: unknown): boolean => {
  return error instanceof HttpError && error.status === 404
}

/**
 * Check if error is a network error
 */
export const isNetworkError = (error: unknown): boolean => {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true
  }
  
  if (error instanceof Error && (
    error.message.includes('network') ||
    error.message.includes('NetworkError') ||
    error.message.includes('Failed to fetch')
  )) {
    return true
  }
  
  return false
}

/**
 * Check if error is a timeout error
 */
export const isTimeoutError = (error: unknown): boolean => {
  if (error instanceof Error && (
    error.message.includes('timeout') ||
    error.message.includes('timed out')
  )) {
    return true
  }
  
  return false
}

/**
 * Log error with context
 */
export const logError = (context: string, error: unknown): void => {
  console.error(`[${context}]`, getErrorMessage(error), error)
}

/**
 * Create a user-friendly error notification
 */
export const createErrorNotification = (error: unknown): {
  title: string
  message: string
  type: 'error' | 'warning'
} => {
  if (isNotFoundError(error)) {
    return {
      title: 'Resource Not Found',
      message: 'The requested resource could not be found.',
      type: 'warning',
    }
  }
  
  if (isNetworkError(error)) {
    return {
      title: 'Network Error',
      message: 'Unable to connect to the server. Please check your connection.',
      type: 'error',
    }
  }
  
  if (isTimeoutError(error)) {
    return {
      title: 'Request Timeout',
      message: 'The request took too long to complete. Please try again.',
      type: 'warning',
    }
  }
  
  return {
    title: 'Error',
    message: getErrorMessage(error),
    type: 'error',
  }
}
