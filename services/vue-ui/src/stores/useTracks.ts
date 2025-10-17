import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { wrap } from 'comlink';
import type { TrackEvent, TrackIndex, TrackMeta, RenderObject } from '../types/tracks';
import { fetchSessionIndex, fetchSessionMeta, fetchSessionSegment, HttpError } from '../api/sessions';
import { segmentCache } from './segmentCache';

interface NdjsonParser {
  parseSegment(data: ArrayBuffer, encoding: string | null): Promise<TrackEvent[]>;
}

const MAX_SEGMENTS_IN_MEMORY = 12;
const EVENT_WINDOW_SECONDS = 0.2;
const TRAIL_WINDOW_SECONDS = 2.0;

const parserWorker = new Worker(new URL('../workers/ndjsonParser.worker.ts', import.meta.url), {
  type: 'module'
});
const parser = wrap<NdjsonParser>(parserWorker);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const useTracksStore = defineStore('tracks', () => {
  const meta = ref<TrackMeta | null>(null);
  const index = ref<TrackIndex | null>(null);
  const sessionId = ref<string | null>(null);

  const segmentEvents = ref<Map<number, TrackEvent[]>>(new Map());
  const loadingSegments = ref<Set<number>>(new Set());
  const lru = ref<number[]>([]);
  const error = ref<string | null>(null);
  const metaMissing = ref(false);
  const indexMissing = ref(false);

  const confMin = ref(0.4);
  const showBoxes = ref(true);
  const showLabels = ref(true);
  const showTrails = ref(false);
  const selectedClasses = ref<Set<number>>(new Set());

  const availableClasses = computed(() => meta.value?.classes ?? []);
  const hasSegments = computed(() => index.value !== null && !indexMissing.value);

  const resetForSession = async (id: string) => {
    if (sessionId.value === id) {
      return;
    }
    sessionId.value = id;
    meta.value = null;
    index.value = null;
    segmentEvents.value = new Map();
    loadingSegments.value = new Set();
    lru.value = [];
    error.value = null;
    metaMissing.value = false;
    indexMissing.value = false;
    selectedClasses.value = new Set();
    await segmentCache.clearSession(id);
  };

  const loadMeta = async (id: string) => {
    try {
      const result = await fetchSessionMeta(id);
      if (result) {
        meta.value = result;
        metaMissing.value = false;
      } else {
        meta.value = null;
        metaMissing.value = true;
      }
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        meta.value = null;
        metaMissing.value = true;
        return;
      }
      console.error('Failed to load session meta', err);
      error.value = err instanceof Error ? err.message : 'Failed to load meta';
      throw err;
    }
  };

  const loadIndex = async (id: string) => {
    try {
      const result = await fetchSessionIndex(id);
      if (result) {
        index.value = result;
        indexMissing.value = false;
      } else {
        index.value = null;
        indexMissing.value = true;
      }
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        index.value = null;
        indexMissing.value = true;
        return;
      }
      console.error('Failed to load session index', err);
      error.value = err instanceof Error ? err.message : 'Failed to load index';
      throw err;
    }
  };

  const markSegmentLoading = (segmentIndex: number, value: boolean) => {
    const next = new Set(loadingSegments.value);
    if (value) {
      next.add(segmentIndex);
    } else {
      next.delete(segmentIndex);
    }
    loadingSegments.value = next;
  };

  const touchSegment = (segmentIndex: number) => {
    const filtered = lru.value.filter((idx) => idx !== segmentIndex);
    filtered.push(segmentIndex);
    lru.value = filtered;
    if (filtered.length > MAX_SEGMENTS_IN_MEMORY) {
      const overflow = filtered.length - MAX_SEGMENTS_IN_MEMORY;
      const currentMap = new Map(segmentEvents.value);
      for (let i = 0; i < overflow; i += 1) {
        const evicted = filtered.shift();
        if (evicted === undefined) {
          break;
        }
        currentMap.delete(evicted);
      }
      lru.value = filtered;
      segmentEvents.value = currentMap;
    }
  };

  const setSegmentEvents = (segmentIndex: number, events: TrackEvent[]) => {
    const nextMap = new Map(segmentEvents.value);
    nextMap.set(segmentIndex, events);
    segmentEvents.value = nextMap;
    touchSegment(segmentIndex);
  };

  const ensureSegment = async (id: string, segmentIndex: number) => {
    if (!index.value || indexMissing.value) return;
    if (segmentEvents.value.has(segmentIndex)) {
      touchSegment(segmentIndex);
      return;
    }
    if (loadingSegments.value.has(segmentIndex)) {
      return;
    }

    markSegmentLoading(segmentIndex, true);
    try {
      const cached = await segmentCache.get(id, segmentIndex);
      if (cached) {
        setSegmentEvents(segmentIndex, cached.events);
        return;
      }

      const { buffer, encoding } = await fetchSessionSegment(id, segmentIndex);
      const events = await parser.parseSegment(buffer, encoding ?? null);
      setSegmentEvents(segmentIndex, events);

      const segmentInfo = index.value.segments.find((entry) => entry.i === segmentIndex);
      await segmentCache.put(id, segmentIndex, {
        events,
        closed: segmentInfo?.closed ?? false
      });
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        console.debug(`Segment ${segmentIndex} not ready yet`);
        return;
      }
      console.error(`Failed to load segment ${segmentIndex}`, err);
      error.value = err instanceof Error ? err.message : 'Failed to load segment';
      throw err;
    } finally {
      markSegmentLoading(segmentIndex, false);
    }
  };

  const prefetchAround = (segmentIndex: number) => {
    const currentId = sessionId.value;
    if (!currentId || !hasSegments.value) return;
    const idx = index.value;
    const maxSegment = idx?.segments[idx.segments.length - 1]?.i ?? Number.POSITIVE_INFINITY;
    const candidates = [segmentIndex - 1, segmentIndex + 1];
    for (const candidate of candidates) {
      if (candidate < 0 || candidate > maxSegment) continue;
      void ensureSegment(currentId, candidate).catch((err) => {
        console.debug('Prefetch failure', err);
      });
    }
  };

  const segmentIndexForTime = (time: number): number | null => {
    if (!index.value) return null;
    const duration = index.value.segment_duration_s;
    if (duration <= 0) return 0;
    return Math.floor(time / duration);
  };

  const filterObject = (obj: TrackEvent['objs'][number]) => {
    if (obj.conf < confMin.value) {
      return false;
    }
    if (selectedClasses.value.size > 0 && !selectedClasses.value.has(obj.cls)) {
      return false;
    }
    return true;
  };

  const eventsAtTime = (time: number): { current: RenderObject[]; trails: Map<number, RenderObject[]> } => {
    if (!index.value) {
      return { current: [], trails: new Map() };
    }
    const windowStart = Math.max(0, time - (showTrails.value ? TRAIL_WINDOW_SECONDS : EVENT_WINDOW_SECONDS));
    const windowEnd = time + EVENT_WINDOW_SECONDS;
    const tolerance = EVENT_WINDOW_SECONDS;
    const trailWindow = showTrails.value ? TRAIL_WINDOW_SECONDS : 0;

    const results: RenderObject[] = [];
    const trails = new Map<number, RenderObject[]>();

    const segDuration = index.value.segment_duration_s;
    const minSegment = Math.max(0, Math.floor(windowStart / segDuration));
    const maxSegment = Math.floor(windowEnd / segDuration) + 1;

    for (const [segmentIdx, events] of segmentEvents.value) {
      if (segmentIdx < minSegment || segmentIdx > maxSegment) {
        continue;
      }
      for (const event of events) {
        const eventTime = event.t_rel_s;
        if (eventTime < windowStart || eventTime > windowEnd) {
          continue;
        }
        for (const obj of event.objs) {
          if (!filterObject(obj)) continue;
          const renderItem: RenderObject = {
            trackId: obj.track_id,
            cls: obj.cls,
            clsName: obj.cls_name,
            conf: obj.conf,
            bbox: [
              clamp(obj.bbox_xyxy[0], 0, 1),
              clamp(obj.bbox_xyxy[1], 0, 1),
              clamp(obj.bbox_xyxy[2], 0, 1),
              clamp(obj.bbox_xyxy[3], 0, 1)
            ],
            time: eventTime
          };

          if (Math.abs(eventTime - time) <= tolerance) {
            results.push(renderItem);
          }

          if (trailWindow > 0 && eventTime <= time && eventTime >= time - trailWindow) {
            const list = trails.get(renderItem.trackId) ?? [];
            list.push(renderItem);
            trails.set(renderItem.trackId, list);
          }
        }
      }
    }

    // Ensure trail points sorted by time ascending to draw tails
    for (const [, list] of trails) {
      list.sort((a, b) => a.time - b.time);
    }

    return { current: results, trails };
  };

  const toggleClass = (classId: number) => {
    const next = new Set(selectedClasses.value);
    if (next.has(classId)) {
      next.delete(classId);
    } else {
      next.add(classId);
    }
    selectedClasses.value = next;
  };

  return {
    meta,
    index,
    sessionId,
    segmentEvents,
    loadingSegments,
    error,
    metaMissing,
    indexMissing,
    confMin,
    showBoxes,
    showLabels,
    showTrails,
    selectedClasses,
    availableClasses,
    hasSegments,
    resetForSession,
    loadMeta,
    loadIndex,
    ensureSegment,
    prefetchAround,
    eventsAtTime,
    segmentIndexForTime,
    toggleClass
  };
});
