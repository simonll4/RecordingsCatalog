import path from 'path';
import { CONFIG } from '../config/config.js';

const TRACKS_BASE_DIR = path.resolve(CONFIG.TRACKS_STORAGE_PATH);
const FRAMES_BASE_DIR = path.resolve(CONFIG.FRAMES_STORAGE_PATH);

/**
 * Ensure a path is within the base directory
 */
export function ensureWithinBase(
  baseDir: string,
  target: string,
  errorMessage: string
): void {
  const relative = path.relative(baseDir, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(errorMessage);
  }
}

/**
 * Normalize and validate a session ID
 */
export function normalizeSessionId(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new Error('sessionId is required');
  }
  
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error('sessionId is required');
  }
  
  if (
    trimmed === '.' ||
    trimmed === '..' ||
    trimmed.includes('/') ||
    trimmed.includes('\\')
  ) {
    throw new Error('Invalid sessionId');
  }
  
  return trimmed;
}

/**
 * Resolve session directory path
 */
export function resolveSessionDir(sessionId: string): string {
  const dir = path.resolve(TRACKS_BASE_DIR, sessionId);
  ensureWithinBase(TRACKS_BASE_DIR, dir, 'Invalid session directory');
  return dir;
}

/**
 * Resolve session file path
 */
export function resolveSessionFile(
  sessionId: string,
  relativePath: string
): string {
  const sessionDir = resolveSessionDir(sessionId);
  const resolved = path.resolve(sessionDir, relativePath);
  ensureWithinBase(sessionDir, resolved, 'Invalid session file path');
  return resolved;
}

/**
 * Resolve frame file path
 */
export function resolveFramePath(
  sessionId: string,
  frameNumber: number,
  extension: string = 'jpg'
): string {
  const frameDir = path.resolve(FRAMES_BASE_DIR, sessionId);
  const framePath = path.resolve(frameDir, `frame_${frameNumber}.${extension}`);
  ensureWithinBase(FRAMES_BASE_DIR, framePath, 'Invalid frame path');
  return framePath;
}

/**
 * Get frames directory for a session
 */
export function getFramesDir(sessionId: string): string {
  const frameDir = path.resolve(FRAMES_BASE_DIR, sessionId);
  ensureWithinBase(FRAMES_BASE_DIR, frameDir, 'Invalid frames directory');
  return frameDir;
}
