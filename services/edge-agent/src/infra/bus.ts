import { EventEmitter } from "events";

export const bus = new EventEmitter();

export type Detection = {
  cls: string;
  conf: number;
  bbox: [number, number, number, number];
};

export type AIEvents =
  | { type: "ai.relevant-start"; ts: string }
  | { type: "ai.keepalive"; ts: string }
  | { type: "ai.relevant-stop"; ts: string }
  | { type: "ai.detections"; ts: string; items: Detection[] };

export type StreamEvents =
  | { type: "stream.started"; ts: string }
  | { type: "stream.stopped"; ts: string; reason?: string };

export type BusEvents = AIEvents | StreamEvents;

// Helpers
export const emit = (e: BusEvents): boolean => bus.emit(e.type, e);
export const on = (type: string, fn: (e: any) => void): EventEmitter => bus.on(type, fn);

