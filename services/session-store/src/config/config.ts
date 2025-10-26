import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import TOML from '@iarna/toml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '..', '..', 'config.toml');

interface Config {
  NODE_ENV: string;
  PORT: number;
  DATABASE_URL: string;
  MEDIAMTX_PLAYBACK_BASE_URL: string;
  MEDIAMTX_SEGMENT_DURATION_SEC: number;
  MEDIAMTX_HOOK_TOKEN: string | null;
  PLAYBACK_EXTRA_SECONDS: number;
  PLAYBACK_START_OFFSET_MS: number;
  FRAMES_STORAGE_PATH: string;
  TRACKS_STORAGE_PATH: string;
}

/**
 * Load and parse TOML configuration file
 */
function loadTomlConfig(): any {
  try {
    const configFile = readFileSync(configPath, 'utf-8');
    return TOML.parse(configFile);
  } catch (error: any) {
    throw new Error(`Failed to load config.toml: ${error.message}`);
  }
}

const tomlConfig = loadTomlConfig();

export const CONFIG: Config = {
  NODE_ENV: tomlConfig.server.node_env ?? 'production',
  PORT: tomlConfig.server.port,
  DATABASE_URL: tomlConfig.database.url,
  MEDIAMTX_PLAYBACK_BASE_URL: tomlConfig.mediamtx.playback_base_url,
  MEDIAMTX_SEGMENT_DURATION_SEC: tomlConfig.mediamtx?.segment_duration_sec ?? 300,
  MEDIAMTX_HOOK_TOKEN: tomlConfig.mediamtx?.hook_token ?? null,
  PLAYBACK_EXTRA_SECONDS: tomlConfig.playback.extra_seconds,
  PLAYBACK_START_OFFSET_MS: tomlConfig.playback.start_offset_ms,
  FRAMES_STORAGE_PATH: tomlConfig.frames.storage_path,
  TRACKS_STORAGE_PATH: tomlConfig.tracks?.storage_path ?? '/data/tracks',
};
