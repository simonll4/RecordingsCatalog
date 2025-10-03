import dotenv from 'dotenv';

dotenv.config();

const env = (key: string, fallback?: string): string => {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`Missing required environment variable ${key}`);
  }
  return value;
};

const parseIntSafe = (value: string, fallback: number): number => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const CONFIG = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: parseInt(env('PORT', '8080'), 10),
  DATABASE_URL: env('DATABASE_URL'),
  MEDIAMTX_PLAYBACK_BASE_URL: env('MEDIAMTX_PLAYBACK_BASE_URL', 'http://mediamtx:9996'),
  PLAYBACK_EXTRA_SECONDS: Math.max(0, parseIntSafe(env('PLAYBACK_EXTRA_SECONDS', '1'), 1))
};
