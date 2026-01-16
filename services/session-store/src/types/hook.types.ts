export interface MediaMTXPublishHook {
  path: string;
  eventTs: string;
}

export interface MediaMTXRecordSegmentCompleteHook {
  path: string;
  segmentPath: string;
  eventTs: string;
  segmentStartTs?: string;
  segmentEndTs?: string;
}
