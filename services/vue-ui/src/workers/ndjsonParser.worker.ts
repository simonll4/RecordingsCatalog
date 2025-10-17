import { expose } from 'comlink';
import { gunzipSync } from 'fflate';
import type { TrackEvent } from '../types/tracks';

const decoder = new TextDecoder();

const parseNdjson = (text: string): TrackEvent[] => {
  const events: TrackEvent[] = [];
  const lines = text.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as TrackEvent;
      events.push(parsed);
    } catch (error) {
      console.warn('Failed to parse NDJSON line', error);
    }
  }
  return events;
};

const parseBuffer = (data: ArrayBufferLike, encoding: string | null): TrackEvent[] => {
  let uint8: Uint8Array = new Uint8Array(data);
  const encodingNormalized = encoding?.toLowerCase() ?? null;

  if (encodingNormalized === 'gzip') {
    uint8 = gunzipSync(uint8) as Uint8Array;
  } else if (encodingNormalized && encodingNormalized !== 'identity') {
    throw new Error(`Unsupported encoding: ${encodingNormalized}`);
  }

  const text = decoder.decode(uint8);
  return parseNdjson(text);
};

const workerApi = {
  parseSegment(data: ArrayBuffer, encoding: string | null): TrackEvent[] {
    return parseBuffer(data, encoding);
  }
};

export type NdjsonParserWorker = typeof workerApi;

expose(workerApi);
