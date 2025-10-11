/**
 * AI Module - Barrel export
 *
 * Exporta todas las APIs públicas del módulo:
 * - Ports (interfaces)
 * - Implementaciones concretas (adapters)
 * - Utilities (feeder, client, cache, ingest)
 */

// Ports (interfaces)
export * from "./ports/ai-engine.js";
export * from "./ports/ai-client.js";

// Implementaciones
export * from "./client/ai-client-tcp.js";
export * from "./feeder/index.js"; // AIFeeder + types
export * from "./ingest/frame-ingester.js";
export * from "./cache/frame-cache.js";
