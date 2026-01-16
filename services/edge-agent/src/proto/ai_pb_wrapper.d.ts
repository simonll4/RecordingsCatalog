/**
 * TypeScript definitions for ai_pb_wrapper.js
 */

/**
 * TypeScript definitions for ai_pb_wrapper.js
 * Re-exports the protobuf types from ai_pb.d.ts
 */

// Re-export protobuf types so consumers can import from 'ai_pb_wrapper'
// TypeScript will resolve './ai_pb' to './ai_pb.d.ts'
export * from "./ai_pb";

declare namespace pb {
  namespace ai {
    type MsgType = number;
    type Codec = number;
    type PixelFormat = number;
    type Policy = number;
    type ErrorCode = number;

    type IEnvelope = any;
    type IResponse = any;
    type IRequest = any;
    type IInit = any;
    type IInitOk = any;
    type IWindowUpdate = any;
    type IResult = any;
    type IError = any;
    type IHeartbeat = any;
    type IFrame = any;
    type IPlane = any;

    type Encoder<T = any> = {
      create(properties?: any): T;
      encode(message: T): { finish(): Uint8Array };
      decode(buffer: Uint8Array): T;
    };

    const Request: Encoder;
    const Frame: Encoder;
    const Plane: Encoder;
    const End: Encoder;
    const Envelope: Encoder;
    const Init: Encoder;
    const InitOk: Encoder;
    const WindowUpdate: Encoder;
    const Result: Encoder;
    const Error: Encoder;
    const Heartbeat: Encoder;

    const MsgType: { [key: string]: MsgType };
    const Codec: { [key: string]: Codec };
    const PixelFormat: { [key: string]: PixelFormat };
    const Policy: { [key: string]: Policy };
    const ErrorCode: { [key: string]: ErrorCode };
  }
}

declare const pb: { ai: typeof pb.ai };
export default pb;
