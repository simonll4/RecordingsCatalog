/**
 * ESM wrapper for ai_pb.cjs (CommonJS protobuf)
 * Allows importing with: import pb from './ai_pb_wrapper.js'
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);

const ai_pb = require("./ai_pb.cjs");

// Export as default for cleaner imports
export default ai_pb;
