import Dexie, { type Table } from 'dexie';
import type { TrackEvent } from '../types/tracks';

export interface CachedSegment {
  id: string;
  sessionId: string;
  segmentIndex: number;
  events: TrackEvent[];
  closed: boolean;
  updatedAt: number;
}

class TrackSegmentCache extends Dexie {
  segments!: Table<CachedSegment, string>;

  constructor() {
    super('tracks-cache');
    this.version(1).stores({
      segments: '&id, sessionId, segmentIndex, updatedAt'
    });
  }
}

const db = new TrackSegmentCache();

const makeKey = (sessionId: string, segmentIndex: number): string => `${sessionId}::${segmentIndex}`;

export const segmentCache = {
  async get(sessionId: string, segmentIndex: number): Promise<CachedSegment | undefined> {
    return db.segments.get(makeKey(sessionId, segmentIndex));
  },

  async put(
    sessionId: string,
    segmentIndex: number,
    payload: { events: TrackEvent[]; closed: boolean }
  ): Promise<void> {
    const record: CachedSegment = {
      id: makeKey(sessionId, segmentIndex),
      sessionId,
      segmentIndex,
      events: payload.events,
      closed: payload.closed,
      updatedAt: Date.now()
    };
    await db.segments.put(record);
  },

  async clearSession(sessionId: string): Promise<void> {
    await db.segments.where({ sessionId }).delete();
  }
};
