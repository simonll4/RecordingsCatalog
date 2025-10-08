// Wrapper para usar protobuf generado con CommonJS en ES modules
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pb = require('./ai_pb.cjs');
export default pb;
