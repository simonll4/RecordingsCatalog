// TypeScript definitions for protobuf wrapper
import * as $protobuf from "protobufjs";
import Long from "long";

declare namespace pb {
    export namespace ai {
    interface IEnvelope {
        req?: ai.IRequest | null;
        res?: ai.IResponse | null;
        hb?: ai.IHeartbeat | null;
    }

    class Envelope implements IEnvelope {
        constructor(properties?: ai.IEnvelope);
        req?: ai.IRequest | null;
        res?: ai.IResponse | null;
        hb?: ai.IHeartbeat | null;
        msg?: ("req" | "res" | "hb");
        static encode(message: ai.IEnvelope, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: $protobuf.Reader | Uint8Array, length?: number): ai.Envelope;
        static create(properties?: ai.IEnvelope): ai.Envelope;
    }

    interface IRequest {
        init?: ai.IInit | null;
        frame?: ai.IFrame | null;
        shutdown?: ai.IShutdown | null;
    }

    class Request implements IRequest {
        constructor(properties?: ai.IRequest);
        init?: ai.IInit | null;
        frame?: ai.IFrame | null;
        shutdown?: ai.IShutdown | null;
        kind?: ("init" | "frame" | "shutdown");
        static encode(message: ai.IRequest, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: $protobuf.Reader | Uint8Array, length?: number): ai.Request;
        static create(properties?: ai.IRequest): ai.Request;
    }

    interface IInit {
        modelPath?: string | null;
        width?: number | null;
        height?: number | null;
        confThreshold?: number | null;
        classesFilter?: number[] | null;
    }

    class Init implements IInit {
        constructor(properties?: ai.IInit);
        modelPath: string;
        width: number;
        height: number;
        confThreshold: number;
        classesFilter: number[];
        static encode(message: ai.IInit, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: $protobuf.Reader | Uint8Array, length?: number): ai.Init;
        static create(properties?: ai.IInit): ai.Init;
    }

    interface IFrame {
        seq?: number | Long | null;
        tsIso?: string | null;
        tsMonoNs?: number | Long | null;
        width?: number | null;
        height?: number | null;
        pixFmt?: string | null;
        data?: Uint8Array | null;
    }

    class Frame implements IFrame {
        constructor(properties?: ai.IFrame);
        seq: number | Long;
        tsIso: string;
        tsMonoNs: number | Long;
        width: number;
        height: number;
        pixFmt: string;
        data: Uint8Array;
        static encode(message: ai.IFrame, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: $protobuf.Reader | Uint8Array, length?: number): ai.Frame;
        static create(properties?: ai.IFrame): ai.Frame;
    }

    interface IShutdown {
    }

    class Shutdown implements IShutdown {
        constructor(properties?: ai.IShutdown);
        static encode(message: ai.IShutdown, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: $protobuf.Reader | Uint8Array, length?: number): ai.Shutdown;
        static create(properties?: ai.IShutdown): ai.Shutdown;
    }

    interface IResponse {
        initOk?: ai.IInitOk | null;
        ready?: ai.IReady | null;
        result?: ai.IResult | null;
        error?: ai.IError | null;
    }

    class Response implements IResponse {
        constructor(properties?: ai.IResponse);
        initOk?: ai.IInitOk | null;
        ready?: ai.IReady | null;
        result?: ai.IResult | null;
        error?: ai.IError | null;
        kind?: ("initOk" | "ready" | "result" | "error");
        static encode(message: ai.IResponse, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: $protobuf.Reader | Uint8Array, length?: number): ai.Response;
        static create(properties?: ai.IResponse): ai.Response;
    }

    interface IInitOk {
        runtime?: string | null;
        modelVersion?: string | null;
        classNames?: string[] | null;
        maxFrameBytes?: number | null;
        providers?: string[] | null;
        modelId?: string | null;
        preproc?: ai.IPreprocessing | null;
    }

    class InitOk implements IInitOk {
        constructor(properties?: ai.IInitOk);
        runtime: string;
        modelVersion: string;
        classNames: string[];
        maxFrameBytes: number;
        providers: string[];
        modelId: string;
        preproc?: ai.IPreprocessing | null;
        static encode(message: ai.IInitOk, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: $protobuf.Reader | Uint8Array, length?: number): ai.InitOk;
        static create(properties?: ai.IInitOk): ai.InitOk;
    }

    interface IPreprocessing {
        layout?: string | null;
        mean?: number[] | null;
        std?: number[] | null;
        letterbox?: boolean | null;
    }

    class Preprocessing implements IPreprocessing {
        constructor(properties?: ai.IPreprocessing);
        layout: string;
        mean: number[];
        std: number[];
        letterbox: boolean;
        static encode(message: ai.IPreprocessing, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: $protobuf.Reader | Uint8Array, length?: number): ai.Preprocessing;
        static create(properties?: ai.IPreprocessing): ai.Preprocessing;
    }

    interface IReady {
        seq?: number | Long | null;
    }

    class Ready implements IReady {
        constructor(properties?: ai.IReady);
        seq: number | Long;
        static encode(message: ai.IReady, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: $protobuf.Reader | Uint8Array, length?: number): ai.Ready;
        static create(properties?: ai.IReady): ai.Ready;
    }

    interface IResult {
        seq?: number | Long | null;
        tsIso?: string | null;
        tsMonoNs?: number | Long | null;
        detections?: ai.IDetection[] | null;
    }

    class Result implements IResult {
        constructor(properties?: ai.IResult);
        seq: number | Long;
        tsIso: string;
        tsMonoNs: number | Long;
        detections: ai.IDetection[];
        static encode(message: ai.IResult, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: $protobuf.Reader | Uint8Array, length?: number): ai.Result;
        static create(properties?: ai.IResult): ai.Result;
    }

    interface IDetection {
        cls?: string | null;
        conf?: number | null;
        bbox?: ai.IBoundingBox | null;
        trackId?: string | null;
    }

    class Detection implements IDetection {
        constructor(properties?: ai.IDetection);
        cls: string;
        conf: number;
        bbox?: ai.IBoundingBox | null;
        trackId: string;
        static encode(message: ai.IDetection, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: $protobuf.Reader | Uint8Array, length?: number): ai.Detection;
        static create(properties?: ai.IDetection): ai.Detection;
    }

    interface IBoundingBox {
        x?: number | null;
        y?: number | null;
        w?: number | null;
        h?: number | null;
    }

    class BoundingBox implements IBoundingBox {
        constructor(properties?: ai.IBoundingBox);
        x: number;
        y: number;
        w: number;
        h: number;
        static encode(message: ai.IBoundingBox, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: $protobuf.Reader | Uint8Array, length?: number): ai.BoundingBox;
        static create(properties?: ai.IBoundingBox): ai.BoundingBox;
    }

    interface IError {
        code?: number | null;
        message?: string | null;
    }

    class Error implements IError {
        constructor(properties?: ai.IError);
        code: number;
        message: string;
        static encode(message: ai.IError, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: $protobuf.Reader | Uint8Array, length?: number): ai.Error;
        static create(properties?: ai.IError): ai.Error;
    }

    interface IHeartbeat {
        tsMonoNs?: number | Long | null;
    }

    class Heartbeat implements IHeartbeat {
        constructor(properties?: ai.IHeartbeat);
        tsMonoNs: number | Long;
        static encode(message: ai.IHeartbeat, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: $protobuf.Reader | Uint8Array, length?: number): ai.Heartbeat;
        static create(properties?: ai.IHeartbeat): ai.Heartbeat;
    }
    }
}

export default pb;

