/**
 * AI Feeder - Barrel export
 *
 * Re-exporta el feeder principal y sus tipos públicos.
 * Permite importar desde modules/ai/feeder en lugar de ai/ai-feeder.
 */

export { AIFeeder } from "./ai-feeder.js";
export type { AIFeederConfig, FeederCallbacks } from "./ai-feeder.js";
