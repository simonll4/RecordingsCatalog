/**
 * Date and Time Utilities
 * Helpers for working with dates and timestamps
 */

/**
 * Format a date to ISO string
 */
export const toISOString = (date: Date | string): string => {
  return date instanceof Date ? date.toISOString() : new Date(date).toISOString()
}

/**
 * Parse a date from string or return the Date object
 */
export const parseDate = (date: Date | string): Date => {
  return date instanceof Date ? date : new Date(date)
}

/**
 * Calculate duration in seconds between two dates
 */
export const getDurationSeconds = (start: Date | string, end: Date | string): number => {
  const startDate = parseDate(start)
  const endDate = parseDate(end)
  const durationMs = endDate.getTime() - startDate.getTime()
  return Math.max(0, Math.ceil(durationMs / 1000))
}

/**
 * Add milliseconds to a date
 */
export const addMilliseconds = (date: Date | string, ms: number): Date => {
  const baseDate = parseDate(date)
  return new Date(baseDate.getTime() + ms)
}

/**
 * Format duration in seconds to human readable string
 */
export const formatDuration = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds}s`
  }
  
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  
  if (minutes < 60) {
    return remainingSeconds > 0 
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`
  }
  
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  
  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`
}

/**
 * Format timestamp to readable date and time
 */
export const formatTimestamp = (timestamp: Date | string): string => {
  const date = parseDate(timestamp)
  return date.toLocaleString()
}

/**
 * Format timestamp to short date
 */
export const formatDate = (timestamp: Date | string): string => {
  const date = parseDate(timestamp)
  return date.toLocaleDateString()
}

/**
 * Format timestamp to short time
 */
export const formatTime = (timestamp: Date | string): string => {
  const date = parseDate(timestamp)
  return date.toLocaleTimeString()
}
