/**
 * Video Module - Barrel export
 *
 * Exporta ports e implementaciones del módulo de video.
 */

// Ports (interfaces)
export * from "./ports/camera-hub.js";

// Implementaciones GStreamer
export * from "./adapters/gstreamer/camera-hub-gst.js";
export * from "./adapters/gstreamer/nv12-capture-gst.js";
