/**
 * Parse a value to a Date object
 */
export function parseIsoDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  
  if (typeof value !== 'string') {
    return null;
  }
  
  const normalised = value.includes('T') ? value : value.replace(' ', 'T');
  const parsed = new Date(normalised);
  
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  
  return parsed;
}

/**
 * Parse a positive integer
 */
export function parsePositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value >= 0 ? value : null;
  }
  
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      return null;
    }
    return parsed;
  }
  
  return null;
}
