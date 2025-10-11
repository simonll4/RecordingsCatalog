/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
"use strict";

var $protobuf = require("protobufjs/minimal");

// Common aliases
var $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
var $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

$root.ai = (function() {

    /**
     * Namespace ai.
     * @exports ai
     * @namespace
     */
    var ai = {};

    ai.Envelope = (function() {

        /**
         * Properties of an Envelope.
         * @memberof ai
         * @interface IEnvelope
         * @property {number|null} [protocolVersion] Envelope protocolVersion
         * @property {string|null} [streamId] Envelope streamId
         * @property {ai.MsgType|null} [msgType] Envelope msgType
         * @property {ai.IRequest|null} [req] Envelope req
         * @property {ai.IResponse|null} [res] Envelope res
         * @property {ai.IHeartbeat|null} [hb] Envelope hb
         */

        /**
         * Constructs a new Envelope.
         * @memberof ai
         * @classdesc Represents an Envelope.
         * @implements IEnvelope
         * @constructor
         * @param {ai.IEnvelope=} [properties] Properties to set
         */
        function Envelope(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Envelope protocolVersion.
         * @member {number} protocolVersion
         * @memberof ai.Envelope
         * @instance
         */
        Envelope.prototype.protocolVersion = 0;

        /**
         * Envelope streamId.
         * @member {string} streamId
         * @memberof ai.Envelope
         * @instance
         */
        Envelope.prototype.streamId = "";

        /**
         * Envelope msgType.
         * @member {ai.MsgType} msgType
         * @memberof ai.Envelope
         * @instance
         */
        Envelope.prototype.msgType = 0;

        /**
         * Envelope req.
         * @member {ai.IRequest|null|undefined} req
         * @memberof ai.Envelope
         * @instance
         */
        Envelope.prototype.req = null;

        /**
         * Envelope res.
         * @member {ai.IResponse|null|undefined} res
         * @memberof ai.Envelope
         * @instance
         */
        Envelope.prototype.res = null;

        /**
         * Envelope hb.
         * @member {ai.IHeartbeat|null|undefined} hb
         * @memberof ai.Envelope
         * @instance
         */
        Envelope.prototype.hb = null;

        // OneOf field names bound to virtual getters and setters
        var $oneOfFields;

        /**
         * Envelope msg.
         * @member {"req"|"res"|"hb"|undefined} msg
         * @memberof ai.Envelope
         * @instance
         */
        Object.defineProperty(Envelope.prototype, "msg", {
            get: $util.oneOfGetter($oneOfFields = ["req", "res", "hb"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Creates a new Envelope instance using the specified properties.
         * @function create
         * @memberof ai.Envelope
         * @static
         * @param {ai.IEnvelope=} [properties] Properties to set
         * @returns {ai.Envelope} Envelope instance
         */
        Envelope.create = function create(properties) {
            return new Envelope(properties);
        };

        /**
         * Encodes the specified Envelope message. Does not implicitly {@link ai.Envelope.verify|verify} messages.
         * @function encode
         * @memberof ai.Envelope
         * @static
         * @param {ai.IEnvelope} message Envelope message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Envelope.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.protocolVersion != null && Object.hasOwnProperty.call(message, "protocolVersion"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.protocolVersion);
            if (message.streamId != null && Object.hasOwnProperty.call(message, "streamId"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.streamId);
            if (message.msgType != null && Object.hasOwnProperty.call(message, "msgType"))
                writer.uint32(/* id 3, wireType 0 =*/24).int32(message.msgType);
            if (message.req != null && Object.hasOwnProperty.call(message, "req"))
                $root.ai.Request.encode(message.req, writer.uint32(/* id 10, wireType 2 =*/82).fork()).ldelim();
            if (message.res != null && Object.hasOwnProperty.call(message, "res"))
                $root.ai.Response.encode(message.res, writer.uint32(/* id 11, wireType 2 =*/90).fork()).ldelim();
            if (message.hb != null && Object.hasOwnProperty.call(message, "hb"))
                $root.ai.Heartbeat.encode(message.hb, writer.uint32(/* id 12, wireType 2 =*/98).fork()).ldelim();
            return writer;
        };

        /**
         * Encodes the specified Envelope message, length delimited. Does not implicitly {@link ai.Envelope.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ai.Envelope
         * @static
         * @param {ai.IEnvelope} message Envelope message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Envelope.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes an Envelope message from the specified reader or buffer.
         * @function decode
         * @memberof ai.Envelope
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ai.Envelope} Envelope
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Envelope.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ai.Envelope();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.protocolVersion = reader.uint32();
                        break;
                    }
                case 2: {
                        message.streamId = reader.string();
                        break;
                    }
                case 3: {
                        message.msgType = reader.int32();
                        break;
                    }
                case 10: {
                        message.req = $root.ai.Request.decode(reader, reader.uint32());
                        break;
                    }
                case 11: {
                        message.res = $root.ai.Response.decode(reader, reader.uint32());
                        break;
                    }
                case 12: {
                        message.hb = $root.ai.Heartbeat.decode(reader, reader.uint32());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes an Envelope message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ai.Envelope
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ai.Envelope} Envelope
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Envelope.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies an Envelope message.
         * @function verify
         * @memberof ai.Envelope
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Envelope.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            var properties = {};
            if (message.protocolVersion != null && message.hasOwnProperty("protocolVersion"))
                if (!$util.isInteger(message.protocolVersion))
                    return "protocolVersion: integer expected";
            if (message.streamId != null && message.hasOwnProperty("streamId"))
                if (!$util.isString(message.streamId))
                    return "streamId: string expected";
            if (message.msgType != null && message.hasOwnProperty("msgType"))
                switch (message.msgType) {
                default:
                    return "msgType: enum value expected";
                case 0:
                case 1:
                case 2:
                case 3:
                case 4:
                case 5:
                case 6:
                case 7:
                case 8:
                    break;
                }
            if (message.req != null && message.hasOwnProperty("req")) {
                properties.msg = 1;
                {
                    var error = $root.ai.Request.verify(message.req);
                    if (error)
                        return "req." + error;
                }
            }
            if (message.res != null && message.hasOwnProperty("res")) {
                if (properties.msg === 1)
                    return "msg: multiple values";
                properties.msg = 1;
                {
                    var error = $root.ai.Response.verify(message.res);
                    if (error)
                        return "res." + error;
                }
            }
            if (message.hb != null && message.hasOwnProperty("hb")) {
                if (properties.msg === 1)
                    return "msg: multiple values";
                properties.msg = 1;
                {
                    var error = $root.ai.Heartbeat.verify(message.hb);
                    if (error)
                        return "hb." + error;
                }
            }
            return null;
        };

        /**
         * Creates an Envelope message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ai.Envelope
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ai.Envelope} Envelope
         */
        Envelope.fromObject = function fromObject(object) {
            if (object instanceof $root.ai.Envelope)
                return object;
            var message = new $root.ai.Envelope();
            if (object.protocolVersion != null)
                message.protocolVersion = object.protocolVersion >>> 0;
            if (object.streamId != null)
                message.streamId = String(object.streamId);
            switch (object.msgType) {
            default:
                if (typeof object.msgType === "number") {
                    message.msgType = object.msgType;
                    break;
                }
                break;
            case "MT_UNKNOWN":
            case 0:
                message.msgType = 0;
                break;
            case "MT_INIT":
            case 1:
                message.msgType = 1;
                break;
            case "MT_INIT_OK":
            case 2:
                message.msgType = 2;
                break;
            case "MT_WINDOW_UPDATE":
            case 3:
                message.msgType = 3;
                break;
            case "MT_FRAME":
            case 4:
                message.msgType = 4;
                break;
            case "MT_RESULT":
            case 5:
                message.msgType = 5;
                break;
            case "MT_HEARTBEAT":
            case 6:
                message.msgType = 6;
                break;
            case "MT_ERROR":
            case 7:
                message.msgType = 7;
                break;
            case "MT_END":
            case 8:
                message.msgType = 8;
                break;
            }
            if (object.req != null) {
                if (typeof object.req !== "object")
                    throw TypeError(".ai.Envelope.req: object expected");
                message.req = $root.ai.Request.fromObject(object.req);
            }
            if (object.res != null) {
                if (typeof object.res !== "object")
                    throw TypeError(".ai.Envelope.res: object expected");
                message.res = $root.ai.Response.fromObject(object.res);
            }
            if (object.hb != null) {
                if (typeof object.hb !== "object")
                    throw TypeError(".ai.Envelope.hb: object expected");
                message.hb = $root.ai.Heartbeat.fromObject(object.hb);
            }
            return message;
        };

        /**
         * Creates a plain object from an Envelope message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ai.Envelope
         * @static
         * @param {ai.Envelope} message Envelope
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Envelope.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults) {
                object.protocolVersion = 0;
                object.streamId = "";
                object.msgType = options.enums === String ? "MT_UNKNOWN" : 0;
            }
            if (message.protocolVersion != null && message.hasOwnProperty("protocolVersion"))
                object.protocolVersion = message.protocolVersion;
            if (message.streamId != null && message.hasOwnProperty("streamId"))
                object.streamId = message.streamId;
            if (message.msgType != null && message.hasOwnProperty("msgType"))
                object.msgType = options.enums === String ? $root.ai.MsgType[message.msgType] === undefined ? message.msgType : $root.ai.MsgType[message.msgType] : message.msgType;
            if (message.req != null && message.hasOwnProperty("req")) {
                object.req = $root.ai.Request.toObject(message.req, options);
                if (options.oneofs)
                    object.msg = "req";
            }
            if (message.res != null && message.hasOwnProperty("res")) {
                object.res = $root.ai.Response.toObject(message.res, options);
                if (options.oneofs)
                    object.msg = "res";
            }
            if (message.hb != null && message.hasOwnProperty("hb")) {
                object.hb = $root.ai.Heartbeat.toObject(message.hb, options);
                if (options.oneofs)
                    object.msg = "hb";
            }
            return object;
        };

        /**
         * Converts this Envelope to JSON.
         * @function toJSON
         * @memberof ai.Envelope
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Envelope.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Envelope
         * @function getTypeUrl
         * @memberof ai.Envelope
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Envelope.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/ai.Envelope";
        };

        return Envelope;
    })();

    /**
     * MsgType enum.
     * @name ai.MsgType
     * @enum {number}
     * @property {number} MT_UNKNOWN=0 MT_UNKNOWN value
     * @property {number} MT_INIT=1 MT_INIT value
     * @property {number} MT_INIT_OK=2 MT_INIT_OK value
     * @property {number} MT_WINDOW_UPDATE=3 MT_WINDOW_UPDATE value
     * @property {number} MT_FRAME=4 MT_FRAME value
     * @property {number} MT_RESULT=5 MT_RESULT value
     * @property {number} MT_HEARTBEAT=6 MT_HEARTBEAT value
     * @property {number} MT_ERROR=7 MT_ERROR value
     * @property {number} MT_END=8 MT_END value
     */
    ai.MsgType = (function() {
        var valuesById = {}, values = Object.create(valuesById);
        values[valuesById[0] = "MT_UNKNOWN"] = 0;
        values[valuesById[1] = "MT_INIT"] = 1;
        values[valuesById[2] = "MT_INIT_OK"] = 2;
        values[valuesById[3] = "MT_WINDOW_UPDATE"] = 3;
        values[valuesById[4] = "MT_FRAME"] = 4;
        values[valuesById[5] = "MT_RESULT"] = 5;
        values[valuesById[6] = "MT_HEARTBEAT"] = 6;
        values[valuesById[7] = "MT_ERROR"] = 7;
        values[valuesById[8] = "MT_END"] = 8;
        return values;
    })();

    /**
     * PixelFormat enum.
     * @name ai.PixelFormat
     * @enum {number}
     * @property {number} PF_UNKNOWN=0 PF_UNKNOWN value
     * @property {number} PF_I420=1 PF_I420 value
     * @property {number} PF_NV12=2 PF_NV12 value
     * @property {number} PF_RGB8=3 PF_RGB8 value
     */
    ai.PixelFormat = (function() {
        var valuesById = {}, values = Object.create(valuesById);
        values[valuesById[0] = "PF_UNKNOWN"] = 0;
        values[valuesById[1] = "PF_I420"] = 1;
        values[valuesById[2] = "PF_NV12"] = 2;
        values[valuesById[3] = "PF_RGB8"] = 3;
        return values;
    })();

    /**
     * Codec enum.
     * @name ai.Codec
     * @enum {number}
     * @property {number} CODEC_UNKNOWN=0 CODEC_UNKNOWN value
     * @property {number} CODEC_NONE=1 CODEC_NONE value
     * @property {number} CODEC_JPEG=2 CODEC_JPEG value
     * @property {number} CODEC_H264=3 CODEC_H264 value
     */
    ai.Codec = (function() {
        var valuesById = {}, values = Object.create(valuesById);
        values[valuesById[0] = "CODEC_UNKNOWN"] = 0;
        values[valuesById[1] = "CODEC_NONE"] = 1;
        values[valuesById[2] = "CODEC_JPEG"] = 2;
        values[valuesById[3] = "CODEC_H264"] = 3;
        return values;
    })();

    /**
     * Policy enum.
     * @name ai.Policy
     * @enum {number}
     * @property {number} POLICY_UNKNOWN=0 POLICY_UNKNOWN value
     * @property {number} LATEST_WINS=1 LATEST_WINS value
     * @property {number} FIFO=2 FIFO value
     */
    ai.Policy = (function() {
        var valuesById = {}, values = Object.create(valuesById);
        values[valuesById[0] = "POLICY_UNKNOWN"] = 0;
        values[valuesById[1] = "LATEST_WINS"] = 1;
        values[valuesById[2] = "FIFO"] = 2;
        return values;
    })();

    /**
     * ErrorCode enum.
     * @name ai.ErrorCode
     * @enum {number}
     * @property {number} ERR_UNKNOWN=0 ERR_UNKNOWN value
     * @property {number} VERSION_UNSUPPORTED=1 VERSION_UNSUPPORTED value
     * @property {number} BAD_MESSAGE=2 BAD_MESSAGE value
     * @property {number} BAD_SEQUENCE=3 BAD_SEQUENCE value
     * @property {number} UNSUPPORTED_FORMAT=4 UNSUPPORTED_FORMAT value
     * @property {number} INVALID_FRAME=5 INVALID_FRAME value
     * @property {number} FRAME_TOO_LARGE=6 FRAME_TOO_LARGE value
     * @property {number} MODEL_NOT_READY=7 MODEL_NOT_READY value
     * @property {number} OOM=8 OOM value
     * @property {number} BACKPRESSURE_TIMEOUT=9 BACKPRESSURE_TIMEOUT value
     * @property {number} INTERNAL=10 INTERNAL value
     */
    ai.ErrorCode = (function() {
        var valuesById = {}, values = Object.create(valuesById);
        values[valuesById[0] = "ERR_UNKNOWN"] = 0;
        values[valuesById[1] = "VERSION_UNSUPPORTED"] = 1;
        values[valuesById[2] = "BAD_MESSAGE"] = 2;
        values[valuesById[3] = "BAD_SEQUENCE"] = 3;
        values[valuesById[4] = "UNSUPPORTED_FORMAT"] = 4;
        values[valuesById[5] = "INVALID_FRAME"] = 5;
        values[valuesById[6] = "FRAME_TOO_LARGE"] = 6;
        values[valuesById[7] = "MODEL_NOT_READY"] = 7;
        values[valuesById[8] = "OOM"] = 8;
        values[valuesById[9] = "BACKPRESSURE_TIMEOUT"] = 9;
        values[valuesById[10] = "INTERNAL"] = 10;
        return values;
    })();

    ai.Request = (function() {

        /**
         * Properties of a Request.
         * @memberof ai
         * @interface IRequest
         * @property {ai.IInit|null} [init] Request init
         * @property {ai.IFrame|null} [frame] Request frame
         * @property {ai.IEnd|null} [end] Request end
         */

        /**
         * Constructs a new Request.
         * @memberof ai
         * @classdesc Represents a Request.
         * @implements IRequest
         * @constructor
         * @param {ai.IRequest=} [properties] Properties to set
         */
        function Request(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Request init.
         * @member {ai.IInit|null|undefined} init
         * @memberof ai.Request
         * @instance
         */
        Request.prototype.init = null;

        /**
         * Request frame.
         * @member {ai.IFrame|null|undefined} frame
         * @memberof ai.Request
         * @instance
         */
        Request.prototype.frame = null;

        /**
         * Request end.
         * @member {ai.IEnd|null|undefined} end
         * @memberof ai.Request
         * @instance
         */
        Request.prototype.end = null;

        // OneOf field names bound to virtual getters and setters
        var $oneOfFields;

        /**
         * Request kind.
         * @member {"init"|"frame"|"end"|undefined} kind
         * @memberof ai.Request
         * @instance
         */
        Object.defineProperty(Request.prototype, "kind", {
            get: $util.oneOfGetter($oneOfFields = ["init", "frame", "end"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Creates a new Request instance using the specified properties.
         * @function create
         * @memberof ai.Request
         * @static
         * @param {ai.IRequest=} [properties] Properties to set
         * @returns {ai.Request} Request instance
         */
        Request.create = function create(properties) {
            return new Request(properties);
        };

        /**
         * Encodes the specified Request message. Does not implicitly {@link ai.Request.verify|verify} messages.
         * @function encode
         * @memberof ai.Request
         * @static
         * @param {ai.IRequest} message Request message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Request.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.init != null && Object.hasOwnProperty.call(message, "init"))
                $root.ai.Init.encode(message.init, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.frame != null && Object.hasOwnProperty.call(message, "frame"))
                $root.ai.Frame.encode(message.frame, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            if (message.end != null && Object.hasOwnProperty.call(message, "end"))
                $root.ai.End.encode(message.end, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
            return writer;
        };

        /**
         * Encodes the specified Request message, length delimited. Does not implicitly {@link ai.Request.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ai.Request
         * @static
         * @param {ai.IRequest} message Request message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Request.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a Request message from the specified reader or buffer.
         * @function decode
         * @memberof ai.Request
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ai.Request} Request
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Request.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ai.Request();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.init = $root.ai.Init.decode(reader, reader.uint32());
                        break;
                    }
                case 2: {
                        message.frame = $root.ai.Frame.decode(reader, reader.uint32());
                        break;
                    }
                case 3: {
                        message.end = $root.ai.End.decode(reader, reader.uint32());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a Request message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ai.Request
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ai.Request} Request
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Request.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Request message.
         * @function verify
         * @memberof ai.Request
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Request.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            var properties = {};
            if (message.init != null && message.hasOwnProperty("init")) {
                properties.kind = 1;
                {
                    var error = $root.ai.Init.verify(message.init);
                    if (error)
                        return "init." + error;
                }
            }
            if (message.frame != null && message.hasOwnProperty("frame")) {
                if (properties.kind === 1)
                    return "kind: multiple values";
                properties.kind = 1;
                {
                    var error = $root.ai.Frame.verify(message.frame);
                    if (error)
                        return "frame." + error;
                }
            }
            if (message.end != null && message.hasOwnProperty("end")) {
                if (properties.kind === 1)
                    return "kind: multiple values";
                properties.kind = 1;
                {
                    var error = $root.ai.End.verify(message.end);
                    if (error)
                        return "end." + error;
                }
            }
            return null;
        };

        /**
         * Creates a Request message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ai.Request
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ai.Request} Request
         */
        Request.fromObject = function fromObject(object) {
            if (object instanceof $root.ai.Request)
                return object;
            var message = new $root.ai.Request();
            if (object.init != null) {
                if (typeof object.init !== "object")
                    throw TypeError(".ai.Request.init: object expected");
                message.init = $root.ai.Init.fromObject(object.init);
            }
            if (object.frame != null) {
                if (typeof object.frame !== "object")
                    throw TypeError(".ai.Request.frame: object expected");
                message.frame = $root.ai.Frame.fromObject(object.frame);
            }
            if (object.end != null) {
                if (typeof object.end !== "object")
                    throw TypeError(".ai.Request.end: object expected");
                message.end = $root.ai.End.fromObject(object.end);
            }
            return message;
        };

        /**
         * Creates a plain object from a Request message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ai.Request
         * @static
         * @param {ai.Request} message Request
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Request.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (message.init != null && message.hasOwnProperty("init")) {
                object.init = $root.ai.Init.toObject(message.init, options);
                if (options.oneofs)
                    object.kind = "init";
            }
            if (message.frame != null && message.hasOwnProperty("frame")) {
                object.frame = $root.ai.Frame.toObject(message.frame, options);
                if (options.oneofs)
                    object.kind = "frame";
            }
            if (message.end != null && message.hasOwnProperty("end")) {
                object.end = $root.ai.End.toObject(message.end, options);
                if (options.oneofs)
                    object.kind = "end";
            }
            return object;
        };

        /**
         * Converts this Request to JSON.
         * @function toJSON
         * @memberof ai.Request
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Request.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Request
         * @function getTypeUrl
         * @memberof ai.Request
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Request.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/ai.Request";
        };

        return Request;
    })();

    ai.Init = (function() {

        /**
         * Properties of an Init.
         * @memberof ai
         * @interface IInit
         * @property {string|null} [model] Init model
         * @property {ai.ICapabilities|null} [caps] Init caps
         */

        /**
         * Constructs a new Init.
         * @memberof ai
         * @classdesc Represents an Init.
         * @implements IInit
         * @constructor
         * @param {ai.IInit=} [properties] Properties to set
         */
        function Init(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Init model.
         * @member {string} model
         * @memberof ai.Init
         * @instance
         */
        Init.prototype.model = "";

        /**
         * Init caps.
         * @member {ai.ICapabilities|null|undefined} caps
         * @memberof ai.Init
         * @instance
         */
        Init.prototype.caps = null;

        /**
         * Creates a new Init instance using the specified properties.
         * @function create
         * @memberof ai.Init
         * @static
         * @param {ai.IInit=} [properties] Properties to set
         * @returns {ai.Init} Init instance
         */
        Init.create = function create(properties) {
            return new Init(properties);
        };

        /**
         * Encodes the specified Init message. Does not implicitly {@link ai.Init.verify|verify} messages.
         * @function encode
         * @memberof ai.Init
         * @static
         * @param {ai.IInit} message Init message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Init.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.model != null && Object.hasOwnProperty.call(message, "model"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.model);
            if (message.caps != null && Object.hasOwnProperty.call(message, "caps"))
                $root.ai.Capabilities.encode(message.caps, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            return writer;
        };

        /**
         * Encodes the specified Init message, length delimited. Does not implicitly {@link ai.Init.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ai.Init
         * @static
         * @param {ai.IInit} message Init message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Init.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes an Init message from the specified reader or buffer.
         * @function decode
         * @memberof ai.Init
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ai.Init} Init
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Init.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ai.Init();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.model = reader.string();
                        break;
                    }
                case 2: {
                        message.caps = $root.ai.Capabilities.decode(reader, reader.uint32());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes an Init message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ai.Init
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ai.Init} Init
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Init.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies an Init message.
         * @function verify
         * @memberof ai.Init
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Init.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.model != null && message.hasOwnProperty("model"))
                if (!$util.isString(message.model))
                    return "model: string expected";
            if (message.caps != null && message.hasOwnProperty("caps")) {
                var error = $root.ai.Capabilities.verify(message.caps);
                if (error)
                    return "caps." + error;
            }
            return null;
        };

        /**
         * Creates an Init message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ai.Init
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ai.Init} Init
         */
        Init.fromObject = function fromObject(object) {
            if (object instanceof $root.ai.Init)
                return object;
            var message = new $root.ai.Init();
            if (object.model != null)
                message.model = String(object.model);
            if (object.caps != null) {
                if (typeof object.caps !== "object")
                    throw TypeError(".ai.Init.caps: object expected");
                message.caps = $root.ai.Capabilities.fromObject(object.caps);
            }
            return message;
        };

        /**
         * Creates a plain object from an Init message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ai.Init
         * @static
         * @param {ai.Init} message Init
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Init.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults) {
                object.model = "";
                object.caps = null;
            }
            if (message.model != null && message.hasOwnProperty("model"))
                object.model = message.model;
            if (message.caps != null && message.hasOwnProperty("caps"))
                object.caps = $root.ai.Capabilities.toObject(message.caps, options);
            return object;
        };

        /**
         * Converts this Init to JSON.
         * @function toJSON
         * @memberof ai.Init
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Init.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Init
         * @function getTypeUrl
         * @memberof ai.Init
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Init.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/ai.Init";
        };

        return Init;
    })();

    ai.Capabilities = (function() {

        /**
         * Properties of a Capabilities.
         * @memberof ai
         * @interface ICapabilities
         * @property {Array.<ai.PixelFormat>|null} [acceptedPixelFormats] Capabilities acceptedPixelFormats
         * @property {Array.<ai.Codec>|null} [acceptedCodecs] Capabilities acceptedCodecs
         * @property {number|null} [maxWidth] Capabilities maxWidth
         * @property {number|null} [maxHeight] Capabilities maxHeight
         * @property {number|null} [maxInflight] Capabilities maxInflight
         * @property {boolean|null} [supportsLetterbox] Capabilities supportsLetterbox
         * @property {boolean|null} [supportsNormalize] Capabilities supportsNormalize
         * @property {string|null} [preferredLayout] Capabilities preferredLayout
         * @property {string|null} [preferredDtype] Capabilities preferredDtype
         * @property {number|null} [desiredMaxFrameBytes] Capabilities desiredMaxFrameBytes
         */

        /**
         * Constructs a new Capabilities.
         * @memberof ai
         * @classdesc Represents a Capabilities.
         * @implements ICapabilities
         * @constructor
         * @param {ai.ICapabilities=} [properties] Properties to set
         */
        function Capabilities(properties) {
            this.acceptedPixelFormats = [];
            this.acceptedCodecs = [];
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Capabilities acceptedPixelFormats.
         * @member {Array.<ai.PixelFormat>} acceptedPixelFormats
         * @memberof ai.Capabilities
         * @instance
         */
        Capabilities.prototype.acceptedPixelFormats = $util.emptyArray;

        /**
         * Capabilities acceptedCodecs.
         * @member {Array.<ai.Codec>} acceptedCodecs
         * @memberof ai.Capabilities
         * @instance
         */
        Capabilities.prototype.acceptedCodecs = $util.emptyArray;

        /**
         * Capabilities maxWidth.
         * @member {number} maxWidth
         * @memberof ai.Capabilities
         * @instance
         */
        Capabilities.prototype.maxWidth = 0;

        /**
         * Capabilities maxHeight.
         * @member {number} maxHeight
         * @memberof ai.Capabilities
         * @instance
         */
        Capabilities.prototype.maxHeight = 0;

        /**
         * Capabilities maxInflight.
         * @member {number} maxInflight
         * @memberof ai.Capabilities
         * @instance
         */
        Capabilities.prototype.maxInflight = 0;

        /**
         * Capabilities supportsLetterbox.
         * @member {boolean} supportsLetterbox
         * @memberof ai.Capabilities
         * @instance
         */
        Capabilities.prototype.supportsLetterbox = false;

        /**
         * Capabilities supportsNormalize.
         * @member {boolean} supportsNormalize
         * @memberof ai.Capabilities
         * @instance
         */
        Capabilities.prototype.supportsNormalize = false;

        /**
         * Capabilities preferredLayout.
         * @member {string} preferredLayout
         * @memberof ai.Capabilities
         * @instance
         */
        Capabilities.prototype.preferredLayout = "";

        /**
         * Capabilities preferredDtype.
         * @member {string} preferredDtype
         * @memberof ai.Capabilities
         * @instance
         */
        Capabilities.prototype.preferredDtype = "";

        /**
         * Capabilities desiredMaxFrameBytes.
         * @member {number} desiredMaxFrameBytes
         * @memberof ai.Capabilities
         * @instance
         */
        Capabilities.prototype.desiredMaxFrameBytes = 0;

        /**
         * Creates a new Capabilities instance using the specified properties.
         * @function create
         * @memberof ai.Capabilities
         * @static
         * @param {ai.ICapabilities=} [properties] Properties to set
         * @returns {ai.Capabilities} Capabilities instance
         */
        Capabilities.create = function create(properties) {
            return new Capabilities(properties);
        };

        /**
         * Encodes the specified Capabilities message. Does not implicitly {@link ai.Capabilities.verify|verify} messages.
         * @function encode
         * @memberof ai.Capabilities
         * @static
         * @param {ai.ICapabilities} message Capabilities message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Capabilities.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.acceptedPixelFormats != null && message.acceptedPixelFormats.length) {
                writer.uint32(/* id 1, wireType 2 =*/10).fork();
                for (var i = 0; i < message.acceptedPixelFormats.length; ++i)
                    writer.int32(message.acceptedPixelFormats[i]);
                writer.ldelim();
            }
            if (message.acceptedCodecs != null && message.acceptedCodecs.length) {
                writer.uint32(/* id 2, wireType 2 =*/18).fork();
                for (var i = 0; i < message.acceptedCodecs.length; ++i)
                    writer.int32(message.acceptedCodecs[i]);
                writer.ldelim();
            }
            if (message.maxWidth != null && Object.hasOwnProperty.call(message, "maxWidth"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.maxWidth);
            if (message.maxHeight != null && Object.hasOwnProperty.call(message, "maxHeight"))
                writer.uint32(/* id 4, wireType 0 =*/32).uint32(message.maxHeight);
            if (message.maxInflight != null && Object.hasOwnProperty.call(message, "maxInflight"))
                writer.uint32(/* id 5, wireType 0 =*/40).uint32(message.maxInflight);
            if (message.supportsLetterbox != null && Object.hasOwnProperty.call(message, "supportsLetterbox"))
                writer.uint32(/* id 6, wireType 0 =*/48).bool(message.supportsLetterbox);
            if (message.supportsNormalize != null && Object.hasOwnProperty.call(message, "supportsNormalize"))
                writer.uint32(/* id 7, wireType 0 =*/56).bool(message.supportsNormalize);
            if (message.preferredLayout != null && Object.hasOwnProperty.call(message, "preferredLayout"))
                writer.uint32(/* id 8, wireType 2 =*/66).string(message.preferredLayout);
            if (message.preferredDtype != null && Object.hasOwnProperty.call(message, "preferredDtype"))
                writer.uint32(/* id 9, wireType 2 =*/74).string(message.preferredDtype);
            if (message.desiredMaxFrameBytes != null && Object.hasOwnProperty.call(message, "desiredMaxFrameBytes"))
                writer.uint32(/* id 10, wireType 0 =*/80).uint32(message.desiredMaxFrameBytes);
            return writer;
        };

        /**
         * Encodes the specified Capabilities message, length delimited. Does not implicitly {@link ai.Capabilities.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ai.Capabilities
         * @static
         * @param {ai.ICapabilities} message Capabilities message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Capabilities.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a Capabilities message from the specified reader or buffer.
         * @function decode
         * @memberof ai.Capabilities
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ai.Capabilities} Capabilities
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Capabilities.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ai.Capabilities();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.acceptedPixelFormats && message.acceptedPixelFormats.length))
                            message.acceptedPixelFormats = [];
                        if ((tag & 7) === 2) {
                            var end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2)
                                message.acceptedPixelFormats.push(reader.int32());
                        } else
                            message.acceptedPixelFormats.push(reader.int32());
                        break;
                    }
                case 2: {
                        if (!(message.acceptedCodecs && message.acceptedCodecs.length))
                            message.acceptedCodecs = [];
                        if ((tag & 7) === 2) {
                            var end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2)
                                message.acceptedCodecs.push(reader.int32());
                        } else
                            message.acceptedCodecs.push(reader.int32());
                        break;
                    }
                case 3: {
                        message.maxWidth = reader.uint32();
                        break;
                    }
                case 4: {
                        message.maxHeight = reader.uint32();
                        break;
                    }
                case 5: {
                        message.maxInflight = reader.uint32();
                        break;
                    }
                case 6: {
                        message.supportsLetterbox = reader.bool();
                        break;
                    }
                case 7: {
                        message.supportsNormalize = reader.bool();
                        break;
                    }
                case 8: {
                        message.preferredLayout = reader.string();
                        break;
                    }
                case 9: {
                        message.preferredDtype = reader.string();
                        break;
                    }
                case 10: {
                        message.desiredMaxFrameBytes = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a Capabilities message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ai.Capabilities
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ai.Capabilities} Capabilities
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Capabilities.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Capabilities message.
         * @function verify
         * @memberof ai.Capabilities
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Capabilities.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.acceptedPixelFormats != null && message.hasOwnProperty("acceptedPixelFormats")) {
                if (!Array.isArray(message.acceptedPixelFormats))
                    return "acceptedPixelFormats: array expected";
                for (var i = 0; i < message.acceptedPixelFormats.length; ++i)
                    switch (message.acceptedPixelFormats[i]) {
                    default:
                        return "acceptedPixelFormats: enum value[] expected";
                    case 0:
                    case 1:
                    case 2:
                    case 3:
                        break;
                    }
            }
            if (message.acceptedCodecs != null && message.hasOwnProperty("acceptedCodecs")) {
                if (!Array.isArray(message.acceptedCodecs))
                    return "acceptedCodecs: array expected";
                for (var i = 0; i < message.acceptedCodecs.length; ++i)
                    switch (message.acceptedCodecs[i]) {
                    default:
                        return "acceptedCodecs: enum value[] expected";
                    case 0:
                    case 1:
                    case 2:
                    case 3:
                        break;
                    }
            }
            if (message.maxWidth != null && message.hasOwnProperty("maxWidth"))
                if (!$util.isInteger(message.maxWidth))
                    return "maxWidth: integer expected";
            if (message.maxHeight != null && message.hasOwnProperty("maxHeight"))
                if (!$util.isInteger(message.maxHeight))
                    return "maxHeight: integer expected";
            if (message.maxInflight != null && message.hasOwnProperty("maxInflight"))
                if (!$util.isInteger(message.maxInflight))
                    return "maxInflight: integer expected";
            if (message.supportsLetterbox != null && message.hasOwnProperty("supportsLetterbox"))
                if (typeof message.supportsLetterbox !== "boolean")
                    return "supportsLetterbox: boolean expected";
            if (message.supportsNormalize != null && message.hasOwnProperty("supportsNormalize"))
                if (typeof message.supportsNormalize !== "boolean")
                    return "supportsNormalize: boolean expected";
            if (message.preferredLayout != null && message.hasOwnProperty("preferredLayout"))
                if (!$util.isString(message.preferredLayout))
                    return "preferredLayout: string expected";
            if (message.preferredDtype != null && message.hasOwnProperty("preferredDtype"))
                if (!$util.isString(message.preferredDtype))
                    return "preferredDtype: string expected";
            if (message.desiredMaxFrameBytes != null && message.hasOwnProperty("desiredMaxFrameBytes"))
                if (!$util.isInteger(message.desiredMaxFrameBytes))
                    return "desiredMaxFrameBytes: integer expected";
            return null;
        };

        /**
         * Creates a Capabilities message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ai.Capabilities
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ai.Capabilities} Capabilities
         */
        Capabilities.fromObject = function fromObject(object) {
            if (object instanceof $root.ai.Capabilities)
                return object;
            var message = new $root.ai.Capabilities();
            if (object.acceptedPixelFormats) {
                if (!Array.isArray(object.acceptedPixelFormats))
                    throw TypeError(".ai.Capabilities.acceptedPixelFormats: array expected");
                message.acceptedPixelFormats = [];
                for (var i = 0; i < object.acceptedPixelFormats.length; ++i)
                    switch (object.acceptedPixelFormats[i]) {
                    default:
                        if (typeof object.acceptedPixelFormats[i] === "number") {
                            message.acceptedPixelFormats[i] = object.acceptedPixelFormats[i];
                            break;
                        }
                    case "PF_UNKNOWN":
                    case 0:
                        message.acceptedPixelFormats[i] = 0;
                        break;
                    case "PF_I420":
                    case 1:
                        message.acceptedPixelFormats[i] = 1;
                        break;
                    case "PF_NV12":
                    case 2:
                        message.acceptedPixelFormats[i] = 2;
                        break;
                    case "PF_RGB8":
                    case 3:
                        message.acceptedPixelFormats[i] = 3;
                        break;
                    }
            }
            if (object.acceptedCodecs) {
                if (!Array.isArray(object.acceptedCodecs))
                    throw TypeError(".ai.Capabilities.acceptedCodecs: array expected");
                message.acceptedCodecs = [];
                for (var i = 0; i < object.acceptedCodecs.length; ++i)
                    switch (object.acceptedCodecs[i]) {
                    default:
                        if (typeof object.acceptedCodecs[i] === "number") {
                            message.acceptedCodecs[i] = object.acceptedCodecs[i];
                            break;
                        }
                    case "CODEC_UNKNOWN":
                    case 0:
                        message.acceptedCodecs[i] = 0;
                        break;
                    case "CODEC_NONE":
                    case 1:
                        message.acceptedCodecs[i] = 1;
                        break;
                    case "CODEC_JPEG":
                    case 2:
                        message.acceptedCodecs[i] = 2;
                        break;
                    case "CODEC_H264":
                    case 3:
                        message.acceptedCodecs[i] = 3;
                        break;
                    }
            }
            if (object.maxWidth != null)
                message.maxWidth = object.maxWidth >>> 0;
            if (object.maxHeight != null)
                message.maxHeight = object.maxHeight >>> 0;
            if (object.maxInflight != null)
                message.maxInflight = object.maxInflight >>> 0;
            if (object.supportsLetterbox != null)
                message.supportsLetterbox = Boolean(object.supportsLetterbox);
            if (object.supportsNormalize != null)
                message.supportsNormalize = Boolean(object.supportsNormalize);
            if (object.preferredLayout != null)
                message.preferredLayout = String(object.preferredLayout);
            if (object.preferredDtype != null)
                message.preferredDtype = String(object.preferredDtype);
            if (object.desiredMaxFrameBytes != null)
                message.desiredMaxFrameBytes = object.desiredMaxFrameBytes >>> 0;
            return message;
        };

        /**
         * Creates a plain object from a Capabilities message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ai.Capabilities
         * @static
         * @param {ai.Capabilities} message Capabilities
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Capabilities.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.arrays || options.defaults) {
                object.acceptedPixelFormats = [];
                object.acceptedCodecs = [];
            }
            if (options.defaults) {
                object.maxWidth = 0;
                object.maxHeight = 0;
                object.maxInflight = 0;
                object.supportsLetterbox = false;
                object.supportsNormalize = false;
                object.preferredLayout = "";
                object.preferredDtype = "";
                object.desiredMaxFrameBytes = 0;
            }
            if (message.acceptedPixelFormats && message.acceptedPixelFormats.length) {
                object.acceptedPixelFormats = [];
                for (var j = 0; j < message.acceptedPixelFormats.length; ++j)
                    object.acceptedPixelFormats[j] = options.enums === String ? $root.ai.PixelFormat[message.acceptedPixelFormats[j]] === undefined ? message.acceptedPixelFormats[j] : $root.ai.PixelFormat[message.acceptedPixelFormats[j]] : message.acceptedPixelFormats[j];
            }
            if (message.acceptedCodecs && message.acceptedCodecs.length) {
                object.acceptedCodecs = [];
                for (var j = 0; j < message.acceptedCodecs.length; ++j)
                    object.acceptedCodecs[j] = options.enums === String ? $root.ai.Codec[message.acceptedCodecs[j]] === undefined ? message.acceptedCodecs[j] : $root.ai.Codec[message.acceptedCodecs[j]] : message.acceptedCodecs[j];
            }
            if (message.maxWidth != null && message.hasOwnProperty("maxWidth"))
                object.maxWidth = message.maxWidth;
            if (message.maxHeight != null && message.hasOwnProperty("maxHeight"))
                object.maxHeight = message.maxHeight;
            if (message.maxInflight != null && message.hasOwnProperty("maxInflight"))
                object.maxInflight = message.maxInflight;
            if (message.supportsLetterbox != null && message.hasOwnProperty("supportsLetterbox"))
                object.supportsLetterbox = message.supportsLetterbox;
            if (message.supportsNormalize != null && message.hasOwnProperty("supportsNormalize"))
                object.supportsNormalize = message.supportsNormalize;
            if (message.preferredLayout != null && message.hasOwnProperty("preferredLayout"))
                object.preferredLayout = message.preferredLayout;
            if (message.preferredDtype != null && message.hasOwnProperty("preferredDtype"))
                object.preferredDtype = message.preferredDtype;
            if (message.desiredMaxFrameBytes != null && message.hasOwnProperty("desiredMaxFrameBytes"))
                object.desiredMaxFrameBytes = message.desiredMaxFrameBytes;
            return object;
        };

        /**
         * Converts this Capabilities to JSON.
         * @function toJSON
         * @memberof ai.Capabilities
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Capabilities.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Capabilities
         * @function getTypeUrl
         * @memberof ai.Capabilities
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Capabilities.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/ai.Capabilities";
        };

        return Capabilities;
    })();

    ai.Frame = (function() {

        /**
         * Properties of a Frame.
         * @memberof ai
         * @interface IFrame
         * @property {number|Long|null} [frameId] Frame frameId
         * @property {number|Long|null} [tsMonoNs] Frame tsMonoNs
         * @property {number|Long|null} [tsPdtNs] Frame tsPdtNs
         * @property {number|Long|null} [tsUtcNs] Frame tsUtcNs
         * @property {number|null} [width] Frame width
         * @property {number|null} [height] Frame height
         * @property {ai.PixelFormat|null} [pixelFormat] Frame pixelFormat
         * @property {ai.Codec|null} [codec] Frame codec
         * @property {Array.<ai.IPlane>|null} [planes] Frame planes
         * @property {boolean|null} [isKeyframe] Frame isKeyframe
         * @property {string|null} [colorSpace] Frame colorSpace
         * @property {string|null} [colorRange] Frame colorRange
         * @property {Uint8Array|null} [data] Frame data
         * @property {string|null} [sessionId] Frame sessionId
         */

        /**
         * Constructs a new Frame.
         * @memberof ai
         * @classdesc Represents a Frame.
         * @implements IFrame
         * @constructor
         * @param {ai.IFrame=} [properties] Properties to set
         */
        function Frame(properties) {
            this.planes = [];
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Frame frameId.
         * @member {number|Long} frameId
         * @memberof ai.Frame
         * @instance
         */
        Frame.prototype.frameId = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * Frame tsMonoNs.
         * @member {number|Long} tsMonoNs
         * @memberof ai.Frame
         * @instance
         */
        Frame.prototype.tsMonoNs = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * Frame tsPdtNs.
         * @member {number|Long} tsPdtNs
         * @memberof ai.Frame
         * @instance
         */
        Frame.prototype.tsPdtNs = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * Frame tsUtcNs.
         * @member {number|Long} tsUtcNs
         * @memberof ai.Frame
         * @instance
         */
        Frame.prototype.tsUtcNs = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * Frame width.
         * @member {number} width
         * @memberof ai.Frame
         * @instance
         */
        Frame.prototype.width = 0;

        /**
         * Frame height.
         * @member {number} height
         * @memberof ai.Frame
         * @instance
         */
        Frame.prototype.height = 0;

        /**
         * Frame pixelFormat.
         * @member {ai.PixelFormat} pixelFormat
         * @memberof ai.Frame
         * @instance
         */
        Frame.prototype.pixelFormat = 0;

        /**
         * Frame codec.
         * @member {ai.Codec} codec
         * @memberof ai.Frame
         * @instance
         */
        Frame.prototype.codec = 0;

        /**
         * Frame planes.
         * @member {Array.<ai.IPlane>} planes
         * @memberof ai.Frame
         * @instance
         */
        Frame.prototype.planes = $util.emptyArray;

        /**
         * Frame isKeyframe.
         * @member {boolean} isKeyframe
         * @memberof ai.Frame
         * @instance
         */
        Frame.prototype.isKeyframe = false;

        /**
         * Frame colorSpace.
         * @member {string} colorSpace
         * @memberof ai.Frame
         * @instance
         */
        Frame.prototype.colorSpace = "";

        /**
         * Frame colorRange.
         * @member {string} colorRange
         * @memberof ai.Frame
         * @instance
         */
        Frame.prototype.colorRange = "";

        /**
         * Frame data.
         * @member {Uint8Array} data
         * @memberof ai.Frame
         * @instance
         */
        Frame.prototype.data = $util.newBuffer([]);

        /**
         * Frame sessionId.
         * @member {string} sessionId
         * @memberof ai.Frame
         * @instance
         */
        Frame.prototype.sessionId = "";

        /**
         * Creates a new Frame instance using the specified properties.
         * @function create
         * @memberof ai.Frame
         * @static
         * @param {ai.IFrame=} [properties] Properties to set
         * @returns {ai.Frame} Frame instance
         */
        Frame.create = function create(properties) {
            return new Frame(properties);
        };

        /**
         * Encodes the specified Frame message. Does not implicitly {@link ai.Frame.verify|verify} messages.
         * @function encode
         * @memberof ai.Frame
         * @static
         * @param {ai.IFrame} message Frame message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Frame.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.frameId != null && Object.hasOwnProperty.call(message, "frameId"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint64(message.frameId);
            if (message.tsMonoNs != null && Object.hasOwnProperty.call(message, "tsMonoNs"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint64(message.tsMonoNs);
            if (message.tsPdtNs != null && Object.hasOwnProperty.call(message, "tsPdtNs"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint64(message.tsPdtNs);
            if (message.tsUtcNs != null && Object.hasOwnProperty.call(message, "tsUtcNs"))
                writer.uint32(/* id 4, wireType 0 =*/32).uint64(message.tsUtcNs);
            if (message.width != null && Object.hasOwnProperty.call(message, "width"))
                writer.uint32(/* id 5, wireType 0 =*/40).uint32(message.width);
            if (message.height != null && Object.hasOwnProperty.call(message, "height"))
                writer.uint32(/* id 6, wireType 0 =*/48).uint32(message.height);
            if (message.pixelFormat != null && Object.hasOwnProperty.call(message, "pixelFormat"))
                writer.uint32(/* id 7, wireType 0 =*/56).int32(message.pixelFormat);
            if (message.codec != null && Object.hasOwnProperty.call(message, "codec"))
                writer.uint32(/* id 8, wireType 0 =*/64).int32(message.codec);
            if (message.planes != null && message.planes.length)
                for (var i = 0; i < message.planes.length; ++i)
                    $root.ai.Plane.encode(message.planes[i], writer.uint32(/* id 9, wireType 2 =*/74).fork()).ldelim();
            if (message.isKeyframe != null && Object.hasOwnProperty.call(message, "isKeyframe"))
                writer.uint32(/* id 10, wireType 0 =*/80).bool(message.isKeyframe);
            if (message.colorSpace != null && Object.hasOwnProperty.call(message, "colorSpace"))
                writer.uint32(/* id 11, wireType 2 =*/90).string(message.colorSpace);
            if (message.colorRange != null && Object.hasOwnProperty.call(message, "colorRange"))
                writer.uint32(/* id 12, wireType 2 =*/98).string(message.colorRange);
            if (message.data != null && Object.hasOwnProperty.call(message, "data"))
                writer.uint32(/* id 13, wireType 2 =*/106).bytes(message.data);
            if (message.sessionId != null && Object.hasOwnProperty.call(message, "sessionId"))
                writer.uint32(/* id 14, wireType 2 =*/114).string(message.sessionId);
            return writer;
        };

        /**
         * Encodes the specified Frame message, length delimited. Does not implicitly {@link ai.Frame.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ai.Frame
         * @static
         * @param {ai.IFrame} message Frame message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Frame.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a Frame message from the specified reader or buffer.
         * @function decode
         * @memberof ai.Frame
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ai.Frame} Frame
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Frame.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ai.Frame();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.frameId = reader.uint64();
                        break;
                    }
                case 2: {
                        message.tsMonoNs = reader.uint64();
                        break;
                    }
                case 3: {
                        message.tsPdtNs = reader.uint64();
                        break;
                    }
                case 4: {
                        message.tsUtcNs = reader.uint64();
                        break;
                    }
                case 5: {
                        message.width = reader.uint32();
                        break;
                    }
                case 6: {
                        message.height = reader.uint32();
                        break;
                    }
                case 7: {
                        message.pixelFormat = reader.int32();
                        break;
                    }
                case 8: {
                        message.codec = reader.int32();
                        break;
                    }
                case 9: {
                        if (!(message.planes && message.planes.length))
                            message.planes = [];
                        message.planes.push($root.ai.Plane.decode(reader, reader.uint32()));
                        break;
                    }
                case 10: {
                        message.isKeyframe = reader.bool();
                        break;
                    }
                case 11: {
                        message.colorSpace = reader.string();
                        break;
                    }
                case 12: {
                        message.colorRange = reader.string();
                        break;
                    }
                case 13: {
                        message.data = reader.bytes();
                        break;
                    }
                case 14: {
                        message.sessionId = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a Frame message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ai.Frame
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ai.Frame} Frame
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Frame.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Frame message.
         * @function verify
         * @memberof ai.Frame
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Frame.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.frameId != null && message.hasOwnProperty("frameId"))
                if (!$util.isInteger(message.frameId) && !(message.frameId && $util.isInteger(message.frameId.low) && $util.isInteger(message.frameId.high)))
                    return "frameId: integer|Long expected";
            if (message.tsMonoNs != null && message.hasOwnProperty("tsMonoNs"))
                if (!$util.isInteger(message.tsMonoNs) && !(message.tsMonoNs && $util.isInteger(message.tsMonoNs.low) && $util.isInteger(message.tsMonoNs.high)))
                    return "tsMonoNs: integer|Long expected";
            if (message.tsPdtNs != null && message.hasOwnProperty("tsPdtNs"))
                if (!$util.isInteger(message.tsPdtNs) && !(message.tsPdtNs && $util.isInteger(message.tsPdtNs.low) && $util.isInteger(message.tsPdtNs.high)))
                    return "tsPdtNs: integer|Long expected";
            if (message.tsUtcNs != null && message.hasOwnProperty("tsUtcNs"))
                if (!$util.isInteger(message.tsUtcNs) && !(message.tsUtcNs && $util.isInteger(message.tsUtcNs.low) && $util.isInteger(message.tsUtcNs.high)))
                    return "tsUtcNs: integer|Long expected";
            if (message.width != null && message.hasOwnProperty("width"))
                if (!$util.isInteger(message.width))
                    return "width: integer expected";
            if (message.height != null && message.hasOwnProperty("height"))
                if (!$util.isInteger(message.height))
                    return "height: integer expected";
            if (message.pixelFormat != null && message.hasOwnProperty("pixelFormat"))
                switch (message.pixelFormat) {
                default:
                    return "pixelFormat: enum value expected";
                case 0:
                case 1:
                case 2:
                case 3:
                    break;
                }
            if (message.codec != null && message.hasOwnProperty("codec"))
                switch (message.codec) {
                default:
                    return "codec: enum value expected";
                case 0:
                case 1:
                case 2:
                case 3:
                    break;
                }
            if (message.planes != null && message.hasOwnProperty("planes")) {
                if (!Array.isArray(message.planes))
                    return "planes: array expected";
                for (var i = 0; i < message.planes.length; ++i) {
                    var error = $root.ai.Plane.verify(message.planes[i]);
                    if (error)
                        return "planes." + error;
                }
            }
            if (message.isKeyframe != null && message.hasOwnProperty("isKeyframe"))
                if (typeof message.isKeyframe !== "boolean")
                    return "isKeyframe: boolean expected";
            if (message.colorSpace != null && message.hasOwnProperty("colorSpace"))
                if (!$util.isString(message.colorSpace))
                    return "colorSpace: string expected";
            if (message.colorRange != null && message.hasOwnProperty("colorRange"))
                if (!$util.isString(message.colorRange))
                    return "colorRange: string expected";
            if (message.data != null && message.hasOwnProperty("data"))
                if (!(message.data && typeof message.data.length === "number" || $util.isString(message.data)))
                    return "data: buffer expected";
            if (message.sessionId != null && message.hasOwnProperty("sessionId"))
                if (!$util.isString(message.sessionId))
                    return "sessionId: string expected";
            return null;
        };

        /**
         * Creates a Frame message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ai.Frame
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ai.Frame} Frame
         */
        Frame.fromObject = function fromObject(object) {
            if (object instanceof $root.ai.Frame)
                return object;
            var message = new $root.ai.Frame();
            if (object.frameId != null)
                if ($util.Long)
                    (message.frameId = $util.Long.fromValue(object.frameId)).unsigned = true;
                else if (typeof object.frameId === "string")
                    message.frameId = parseInt(object.frameId, 10);
                else if (typeof object.frameId === "number")
                    message.frameId = object.frameId;
                else if (typeof object.frameId === "object")
                    message.frameId = new $util.LongBits(object.frameId.low >>> 0, object.frameId.high >>> 0).toNumber(true);
            if (object.tsMonoNs != null)
                if ($util.Long)
                    (message.tsMonoNs = $util.Long.fromValue(object.tsMonoNs)).unsigned = true;
                else if (typeof object.tsMonoNs === "string")
                    message.tsMonoNs = parseInt(object.tsMonoNs, 10);
                else if (typeof object.tsMonoNs === "number")
                    message.tsMonoNs = object.tsMonoNs;
                else if (typeof object.tsMonoNs === "object")
                    message.tsMonoNs = new $util.LongBits(object.tsMonoNs.low >>> 0, object.tsMonoNs.high >>> 0).toNumber(true);
            if (object.tsPdtNs != null)
                if ($util.Long)
                    (message.tsPdtNs = $util.Long.fromValue(object.tsPdtNs)).unsigned = true;
                else if (typeof object.tsPdtNs === "string")
                    message.tsPdtNs = parseInt(object.tsPdtNs, 10);
                else if (typeof object.tsPdtNs === "number")
                    message.tsPdtNs = object.tsPdtNs;
                else if (typeof object.tsPdtNs === "object")
                    message.tsPdtNs = new $util.LongBits(object.tsPdtNs.low >>> 0, object.tsPdtNs.high >>> 0).toNumber(true);
            if (object.tsUtcNs != null)
                if ($util.Long)
                    (message.tsUtcNs = $util.Long.fromValue(object.tsUtcNs)).unsigned = true;
                else if (typeof object.tsUtcNs === "string")
                    message.tsUtcNs = parseInt(object.tsUtcNs, 10);
                else if (typeof object.tsUtcNs === "number")
                    message.tsUtcNs = object.tsUtcNs;
                else if (typeof object.tsUtcNs === "object")
                    message.tsUtcNs = new $util.LongBits(object.tsUtcNs.low >>> 0, object.tsUtcNs.high >>> 0).toNumber(true);
            if (object.width != null)
                message.width = object.width >>> 0;
            if (object.height != null)
                message.height = object.height >>> 0;
            switch (object.pixelFormat) {
            default:
                if (typeof object.pixelFormat === "number") {
                    message.pixelFormat = object.pixelFormat;
                    break;
                }
                break;
            case "PF_UNKNOWN":
            case 0:
                message.pixelFormat = 0;
                break;
            case "PF_I420":
            case 1:
                message.pixelFormat = 1;
                break;
            case "PF_NV12":
            case 2:
                message.pixelFormat = 2;
                break;
            case "PF_RGB8":
            case 3:
                message.pixelFormat = 3;
                break;
            }
            switch (object.codec) {
            default:
                if (typeof object.codec === "number") {
                    message.codec = object.codec;
                    break;
                }
                break;
            case "CODEC_UNKNOWN":
            case 0:
                message.codec = 0;
                break;
            case "CODEC_NONE":
            case 1:
                message.codec = 1;
                break;
            case "CODEC_JPEG":
            case 2:
                message.codec = 2;
                break;
            case "CODEC_H264":
            case 3:
                message.codec = 3;
                break;
            }
            if (object.planes) {
                if (!Array.isArray(object.planes))
                    throw TypeError(".ai.Frame.planes: array expected");
                message.planes = [];
                for (var i = 0; i < object.planes.length; ++i) {
                    if (typeof object.planes[i] !== "object")
                        throw TypeError(".ai.Frame.planes: object expected");
                    message.planes[i] = $root.ai.Plane.fromObject(object.planes[i]);
                }
            }
            if (object.isKeyframe != null)
                message.isKeyframe = Boolean(object.isKeyframe);
            if (object.colorSpace != null)
                message.colorSpace = String(object.colorSpace);
            if (object.colorRange != null)
                message.colorRange = String(object.colorRange);
            if (object.data != null)
                if (typeof object.data === "string")
                    $util.base64.decode(object.data, message.data = $util.newBuffer($util.base64.length(object.data)), 0);
                else if (object.data.length >= 0)
                    message.data = object.data;
            if (object.sessionId != null)
                message.sessionId = String(object.sessionId);
            return message;
        };

        /**
         * Creates a plain object from a Frame message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ai.Frame
         * @static
         * @param {ai.Frame} message Frame
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Frame.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.arrays || options.defaults)
                object.planes = [];
            if (options.defaults) {
                if ($util.Long) {
                    var long = new $util.Long(0, 0, true);
                    object.frameId = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.frameId = options.longs === String ? "0" : 0;
                if ($util.Long) {
                    var long = new $util.Long(0, 0, true);
                    object.tsMonoNs = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.tsMonoNs = options.longs === String ? "0" : 0;
                if ($util.Long) {
                    var long = new $util.Long(0, 0, true);
                    object.tsPdtNs = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.tsPdtNs = options.longs === String ? "0" : 0;
                if ($util.Long) {
                    var long = new $util.Long(0, 0, true);
                    object.tsUtcNs = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.tsUtcNs = options.longs === String ? "0" : 0;
                object.width = 0;
                object.height = 0;
                object.pixelFormat = options.enums === String ? "PF_UNKNOWN" : 0;
                object.codec = options.enums === String ? "CODEC_UNKNOWN" : 0;
                object.isKeyframe = false;
                object.colorSpace = "";
                object.colorRange = "";
                if (options.bytes === String)
                    object.data = "";
                else {
                    object.data = [];
                    if (options.bytes !== Array)
                        object.data = $util.newBuffer(object.data);
                }
                object.sessionId = "";
            }
            if (message.frameId != null && message.hasOwnProperty("frameId"))
                if (typeof message.frameId === "number")
                    object.frameId = options.longs === String ? String(message.frameId) : message.frameId;
                else
                    object.frameId = options.longs === String ? $util.Long.prototype.toString.call(message.frameId) : options.longs === Number ? new $util.LongBits(message.frameId.low >>> 0, message.frameId.high >>> 0).toNumber(true) : message.frameId;
            if (message.tsMonoNs != null && message.hasOwnProperty("tsMonoNs"))
                if (typeof message.tsMonoNs === "number")
                    object.tsMonoNs = options.longs === String ? String(message.tsMonoNs) : message.tsMonoNs;
                else
                    object.tsMonoNs = options.longs === String ? $util.Long.prototype.toString.call(message.tsMonoNs) : options.longs === Number ? new $util.LongBits(message.tsMonoNs.low >>> 0, message.tsMonoNs.high >>> 0).toNumber(true) : message.tsMonoNs;
            if (message.tsPdtNs != null && message.hasOwnProperty("tsPdtNs"))
                if (typeof message.tsPdtNs === "number")
                    object.tsPdtNs = options.longs === String ? String(message.tsPdtNs) : message.tsPdtNs;
                else
                    object.tsPdtNs = options.longs === String ? $util.Long.prototype.toString.call(message.tsPdtNs) : options.longs === Number ? new $util.LongBits(message.tsPdtNs.low >>> 0, message.tsPdtNs.high >>> 0).toNumber(true) : message.tsPdtNs;
            if (message.tsUtcNs != null && message.hasOwnProperty("tsUtcNs"))
                if (typeof message.tsUtcNs === "number")
                    object.tsUtcNs = options.longs === String ? String(message.tsUtcNs) : message.tsUtcNs;
                else
                    object.tsUtcNs = options.longs === String ? $util.Long.prototype.toString.call(message.tsUtcNs) : options.longs === Number ? new $util.LongBits(message.tsUtcNs.low >>> 0, message.tsUtcNs.high >>> 0).toNumber(true) : message.tsUtcNs;
            if (message.width != null && message.hasOwnProperty("width"))
                object.width = message.width;
            if (message.height != null && message.hasOwnProperty("height"))
                object.height = message.height;
            if (message.pixelFormat != null && message.hasOwnProperty("pixelFormat"))
                object.pixelFormat = options.enums === String ? $root.ai.PixelFormat[message.pixelFormat] === undefined ? message.pixelFormat : $root.ai.PixelFormat[message.pixelFormat] : message.pixelFormat;
            if (message.codec != null && message.hasOwnProperty("codec"))
                object.codec = options.enums === String ? $root.ai.Codec[message.codec] === undefined ? message.codec : $root.ai.Codec[message.codec] : message.codec;
            if (message.planes && message.planes.length) {
                object.planes = [];
                for (var j = 0; j < message.planes.length; ++j)
                    object.planes[j] = $root.ai.Plane.toObject(message.planes[j], options);
            }
            if (message.isKeyframe != null && message.hasOwnProperty("isKeyframe"))
                object.isKeyframe = message.isKeyframe;
            if (message.colorSpace != null && message.hasOwnProperty("colorSpace"))
                object.colorSpace = message.colorSpace;
            if (message.colorRange != null && message.hasOwnProperty("colorRange"))
                object.colorRange = message.colorRange;
            if (message.data != null && message.hasOwnProperty("data"))
                object.data = options.bytes === String ? $util.base64.encode(message.data, 0, message.data.length) : options.bytes === Array ? Array.prototype.slice.call(message.data) : message.data;
            if (message.sessionId != null && message.hasOwnProperty("sessionId"))
                object.sessionId = message.sessionId;
            return object;
        };

        /**
         * Converts this Frame to JSON.
         * @function toJSON
         * @memberof ai.Frame
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Frame.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Frame
         * @function getTypeUrl
         * @memberof ai.Frame
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Frame.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/ai.Frame";
        };

        return Frame;
    })();

    ai.Plane = (function() {

        /**
         * Properties of a Plane.
         * @memberof ai
         * @interface IPlane
         * @property {number|null} [stride] Plane stride
         * @property {number|null} [offset] Plane offset
         * @property {number|null} [size] Plane size
         */

        /**
         * Constructs a new Plane.
         * @memberof ai
         * @classdesc Represents a Plane.
         * @implements IPlane
         * @constructor
         * @param {ai.IPlane=} [properties] Properties to set
         */
        function Plane(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Plane stride.
         * @member {number} stride
         * @memberof ai.Plane
         * @instance
         */
        Plane.prototype.stride = 0;

        /**
         * Plane offset.
         * @member {number} offset
         * @memberof ai.Plane
         * @instance
         */
        Plane.prototype.offset = 0;

        /**
         * Plane size.
         * @member {number} size
         * @memberof ai.Plane
         * @instance
         */
        Plane.prototype.size = 0;

        /**
         * Creates a new Plane instance using the specified properties.
         * @function create
         * @memberof ai.Plane
         * @static
         * @param {ai.IPlane=} [properties] Properties to set
         * @returns {ai.Plane} Plane instance
         */
        Plane.create = function create(properties) {
            return new Plane(properties);
        };

        /**
         * Encodes the specified Plane message. Does not implicitly {@link ai.Plane.verify|verify} messages.
         * @function encode
         * @memberof ai.Plane
         * @static
         * @param {ai.IPlane} message Plane message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Plane.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.stride != null && Object.hasOwnProperty.call(message, "stride"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.stride);
            if (message.offset != null && Object.hasOwnProperty.call(message, "offset"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.offset);
            if (message.size != null && Object.hasOwnProperty.call(message, "size"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.size);
            return writer;
        };

        /**
         * Encodes the specified Plane message, length delimited. Does not implicitly {@link ai.Plane.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ai.Plane
         * @static
         * @param {ai.IPlane} message Plane message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Plane.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a Plane message from the specified reader or buffer.
         * @function decode
         * @memberof ai.Plane
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ai.Plane} Plane
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Plane.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ai.Plane();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.stride = reader.uint32();
                        break;
                    }
                case 2: {
                        message.offset = reader.uint32();
                        break;
                    }
                case 3: {
                        message.size = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a Plane message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ai.Plane
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ai.Plane} Plane
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Plane.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Plane message.
         * @function verify
         * @memberof ai.Plane
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Plane.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.stride != null && message.hasOwnProperty("stride"))
                if (!$util.isInteger(message.stride))
                    return "stride: integer expected";
            if (message.offset != null && message.hasOwnProperty("offset"))
                if (!$util.isInteger(message.offset))
                    return "offset: integer expected";
            if (message.size != null && message.hasOwnProperty("size"))
                if (!$util.isInteger(message.size))
                    return "size: integer expected";
            return null;
        };

        /**
         * Creates a Plane message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ai.Plane
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ai.Plane} Plane
         */
        Plane.fromObject = function fromObject(object) {
            if (object instanceof $root.ai.Plane)
                return object;
            var message = new $root.ai.Plane();
            if (object.stride != null)
                message.stride = object.stride >>> 0;
            if (object.offset != null)
                message.offset = object.offset >>> 0;
            if (object.size != null)
                message.size = object.size >>> 0;
            return message;
        };

        /**
         * Creates a plain object from a Plane message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ai.Plane
         * @static
         * @param {ai.Plane} message Plane
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Plane.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults) {
                object.stride = 0;
                object.offset = 0;
                object.size = 0;
            }
            if (message.stride != null && message.hasOwnProperty("stride"))
                object.stride = message.stride;
            if (message.offset != null && message.hasOwnProperty("offset"))
                object.offset = message.offset;
            if (message.size != null && message.hasOwnProperty("size"))
                object.size = message.size;
            return object;
        };

        /**
         * Converts this Plane to JSON.
         * @function toJSON
         * @memberof ai.Plane
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Plane.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Plane
         * @function getTypeUrl
         * @memberof ai.Plane
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Plane.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/ai.Plane";
        };

        return Plane;
    })();

    ai.End = (function() {

        /**
         * Properties of an End.
         * @memberof ai
         * @interface IEnd
         */

        /**
         * Constructs a new End.
         * @memberof ai
         * @classdesc Represents an End.
         * @implements IEnd
         * @constructor
         * @param {ai.IEnd=} [properties] Properties to set
         */
        function End(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Creates a new End instance using the specified properties.
         * @function create
         * @memberof ai.End
         * @static
         * @param {ai.IEnd=} [properties] Properties to set
         * @returns {ai.End} End instance
         */
        End.create = function create(properties) {
            return new End(properties);
        };

        /**
         * Encodes the specified End message. Does not implicitly {@link ai.End.verify|verify} messages.
         * @function encode
         * @memberof ai.End
         * @static
         * @param {ai.IEnd} message End message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        End.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            return writer;
        };

        /**
         * Encodes the specified End message, length delimited. Does not implicitly {@link ai.End.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ai.End
         * @static
         * @param {ai.IEnd} message End message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        End.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes an End message from the specified reader or buffer.
         * @function decode
         * @memberof ai.End
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ai.End} End
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        End.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ai.End();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes an End message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ai.End
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ai.End} End
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        End.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies an End message.
         * @function verify
         * @memberof ai.End
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        End.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            return null;
        };

        /**
         * Creates an End message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ai.End
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ai.End} End
         */
        End.fromObject = function fromObject(object) {
            if (object instanceof $root.ai.End)
                return object;
            return new $root.ai.End();
        };

        /**
         * Creates a plain object from an End message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ai.End
         * @static
         * @param {ai.End} message End
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        End.toObject = function toObject() {
            return {};
        };

        /**
         * Converts this End to JSON.
         * @function toJSON
         * @memberof ai.End
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        End.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for End
         * @function getTypeUrl
         * @memberof ai.End
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        End.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/ai.End";
        };

        return End;
    })();

    ai.Response = (function() {

        /**
         * Properties of a Response.
         * @memberof ai
         * @interface IResponse
         * @property {ai.IInitOk|null} [initOk] Response initOk
         * @property {ai.IWindowUpdate|null} [windowUpdate] Response windowUpdate
         * @property {ai.IResult|null} [result] Response result
         * @property {ai.IError|null} [error] Response error
         */

        /**
         * Constructs a new Response.
         * @memberof ai
         * @classdesc Represents a Response.
         * @implements IResponse
         * @constructor
         * @param {ai.IResponse=} [properties] Properties to set
         */
        function Response(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Response initOk.
         * @member {ai.IInitOk|null|undefined} initOk
         * @memberof ai.Response
         * @instance
         */
        Response.prototype.initOk = null;

        /**
         * Response windowUpdate.
         * @member {ai.IWindowUpdate|null|undefined} windowUpdate
         * @memberof ai.Response
         * @instance
         */
        Response.prototype.windowUpdate = null;

        /**
         * Response result.
         * @member {ai.IResult|null|undefined} result
         * @memberof ai.Response
         * @instance
         */
        Response.prototype.result = null;

        /**
         * Response error.
         * @member {ai.IError|null|undefined} error
         * @memberof ai.Response
         * @instance
         */
        Response.prototype.error = null;

        // OneOf field names bound to virtual getters and setters
        var $oneOfFields;

        /**
         * Response kind.
         * @member {"initOk"|"windowUpdate"|"result"|"error"|undefined} kind
         * @memberof ai.Response
         * @instance
         */
        Object.defineProperty(Response.prototype, "kind", {
            get: $util.oneOfGetter($oneOfFields = ["initOk", "windowUpdate", "result", "error"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Creates a new Response instance using the specified properties.
         * @function create
         * @memberof ai.Response
         * @static
         * @param {ai.IResponse=} [properties] Properties to set
         * @returns {ai.Response} Response instance
         */
        Response.create = function create(properties) {
            return new Response(properties);
        };

        /**
         * Encodes the specified Response message. Does not implicitly {@link ai.Response.verify|verify} messages.
         * @function encode
         * @memberof ai.Response
         * @static
         * @param {ai.IResponse} message Response message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Response.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.initOk != null && Object.hasOwnProperty.call(message, "initOk"))
                $root.ai.InitOk.encode(message.initOk, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.windowUpdate != null && Object.hasOwnProperty.call(message, "windowUpdate"))
                $root.ai.WindowUpdate.encode(message.windowUpdate, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            if (message.result != null && Object.hasOwnProperty.call(message, "result"))
                $root.ai.Result.encode(message.result, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
            if (message.error != null && Object.hasOwnProperty.call(message, "error"))
                $root.ai.Error.encode(message.error, writer.uint32(/* id 4, wireType 2 =*/34).fork()).ldelim();
            return writer;
        };

        /**
         * Encodes the specified Response message, length delimited. Does not implicitly {@link ai.Response.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ai.Response
         * @static
         * @param {ai.IResponse} message Response message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Response.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a Response message from the specified reader or buffer.
         * @function decode
         * @memberof ai.Response
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ai.Response} Response
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Response.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ai.Response();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.initOk = $root.ai.InitOk.decode(reader, reader.uint32());
                        break;
                    }
                case 2: {
                        message.windowUpdate = $root.ai.WindowUpdate.decode(reader, reader.uint32());
                        break;
                    }
                case 3: {
                        message.result = $root.ai.Result.decode(reader, reader.uint32());
                        break;
                    }
                case 4: {
                        message.error = $root.ai.Error.decode(reader, reader.uint32());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a Response message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ai.Response
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ai.Response} Response
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Response.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Response message.
         * @function verify
         * @memberof ai.Response
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Response.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            var properties = {};
            if (message.initOk != null && message.hasOwnProperty("initOk")) {
                properties.kind = 1;
                {
                    var error = $root.ai.InitOk.verify(message.initOk);
                    if (error)
                        return "initOk." + error;
                }
            }
            if (message.windowUpdate != null && message.hasOwnProperty("windowUpdate")) {
                if (properties.kind === 1)
                    return "kind: multiple values";
                properties.kind = 1;
                {
                    var error = $root.ai.WindowUpdate.verify(message.windowUpdate);
                    if (error)
                        return "windowUpdate." + error;
                }
            }
            if (message.result != null && message.hasOwnProperty("result")) {
                if (properties.kind === 1)
                    return "kind: multiple values";
                properties.kind = 1;
                {
                    var error = $root.ai.Result.verify(message.result);
                    if (error)
                        return "result." + error;
                }
            }
            if (message.error != null && message.hasOwnProperty("error")) {
                if (properties.kind === 1)
                    return "kind: multiple values";
                properties.kind = 1;
                {
                    var error = $root.ai.Error.verify(message.error);
                    if (error)
                        return "error." + error;
                }
            }
            return null;
        };

        /**
         * Creates a Response message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ai.Response
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ai.Response} Response
         */
        Response.fromObject = function fromObject(object) {
            if (object instanceof $root.ai.Response)
                return object;
            var message = new $root.ai.Response();
            if (object.initOk != null) {
                if (typeof object.initOk !== "object")
                    throw TypeError(".ai.Response.initOk: object expected");
                message.initOk = $root.ai.InitOk.fromObject(object.initOk);
            }
            if (object.windowUpdate != null) {
                if (typeof object.windowUpdate !== "object")
                    throw TypeError(".ai.Response.windowUpdate: object expected");
                message.windowUpdate = $root.ai.WindowUpdate.fromObject(object.windowUpdate);
            }
            if (object.result != null) {
                if (typeof object.result !== "object")
                    throw TypeError(".ai.Response.result: object expected");
                message.result = $root.ai.Result.fromObject(object.result);
            }
            if (object.error != null) {
                if (typeof object.error !== "object")
                    throw TypeError(".ai.Response.error: object expected");
                message.error = $root.ai.Error.fromObject(object.error);
            }
            return message;
        };

        /**
         * Creates a plain object from a Response message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ai.Response
         * @static
         * @param {ai.Response} message Response
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Response.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (message.initOk != null && message.hasOwnProperty("initOk")) {
                object.initOk = $root.ai.InitOk.toObject(message.initOk, options);
                if (options.oneofs)
                    object.kind = "initOk";
            }
            if (message.windowUpdate != null && message.hasOwnProperty("windowUpdate")) {
                object.windowUpdate = $root.ai.WindowUpdate.toObject(message.windowUpdate, options);
                if (options.oneofs)
                    object.kind = "windowUpdate";
            }
            if (message.result != null && message.hasOwnProperty("result")) {
                object.result = $root.ai.Result.toObject(message.result, options);
                if (options.oneofs)
                    object.kind = "result";
            }
            if (message.error != null && message.hasOwnProperty("error")) {
                object.error = $root.ai.Error.toObject(message.error, options);
                if (options.oneofs)
                    object.kind = "error";
            }
            return object;
        };

        /**
         * Converts this Response to JSON.
         * @function toJSON
         * @memberof ai.Response
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Response.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Response
         * @function getTypeUrl
         * @memberof ai.Response
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Response.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/ai.Response";
        };

        return Response;
    })();

    ai.InitOk = (function() {

        /**
         * Properties of an InitOk.
         * @memberof ai
         * @interface IInitOk
         * @property {ai.IChosen|null} [chosen] InitOk chosen
         * @property {number|null} [maxFrameBytes] InitOk maxFrameBytes
         */

        /**
         * Constructs a new InitOk.
         * @memberof ai
         * @classdesc Represents an InitOk.
         * @implements IInitOk
         * @constructor
         * @param {ai.IInitOk=} [properties] Properties to set
         */
        function InitOk(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * InitOk chosen.
         * @member {ai.IChosen|null|undefined} chosen
         * @memberof ai.InitOk
         * @instance
         */
        InitOk.prototype.chosen = null;

        /**
         * InitOk maxFrameBytes.
         * @member {number} maxFrameBytes
         * @memberof ai.InitOk
         * @instance
         */
        InitOk.prototype.maxFrameBytes = 0;

        /**
         * Creates a new InitOk instance using the specified properties.
         * @function create
         * @memberof ai.InitOk
         * @static
         * @param {ai.IInitOk=} [properties] Properties to set
         * @returns {ai.InitOk} InitOk instance
         */
        InitOk.create = function create(properties) {
            return new InitOk(properties);
        };

        /**
         * Encodes the specified InitOk message. Does not implicitly {@link ai.InitOk.verify|verify} messages.
         * @function encode
         * @memberof ai.InitOk
         * @static
         * @param {ai.IInitOk} message InitOk message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        InitOk.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.chosen != null && Object.hasOwnProperty.call(message, "chosen"))
                $root.ai.Chosen.encode(message.chosen, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.maxFrameBytes != null && Object.hasOwnProperty.call(message, "maxFrameBytes"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.maxFrameBytes);
            return writer;
        };

        /**
         * Encodes the specified InitOk message, length delimited. Does not implicitly {@link ai.InitOk.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ai.InitOk
         * @static
         * @param {ai.IInitOk} message InitOk message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        InitOk.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes an InitOk message from the specified reader or buffer.
         * @function decode
         * @memberof ai.InitOk
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ai.InitOk} InitOk
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        InitOk.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ai.InitOk();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.chosen = $root.ai.Chosen.decode(reader, reader.uint32());
                        break;
                    }
                case 2: {
                        message.maxFrameBytes = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes an InitOk message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ai.InitOk
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ai.InitOk} InitOk
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        InitOk.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies an InitOk message.
         * @function verify
         * @memberof ai.InitOk
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        InitOk.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.chosen != null && message.hasOwnProperty("chosen")) {
                var error = $root.ai.Chosen.verify(message.chosen);
                if (error)
                    return "chosen." + error;
            }
            if (message.maxFrameBytes != null && message.hasOwnProperty("maxFrameBytes"))
                if (!$util.isInteger(message.maxFrameBytes))
                    return "maxFrameBytes: integer expected";
            return null;
        };

        /**
         * Creates an InitOk message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ai.InitOk
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ai.InitOk} InitOk
         */
        InitOk.fromObject = function fromObject(object) {
            if (object instanceof $root.ai.InitOk)
                return object;
            var message = new $root.ai.InitOk();
            if (object.chosen != null) {
                if (typeof object.chosen !== "object")
                    throw TypeError(".ai.InitOk.chosen: object expected");
                message.chosen = $root.ai.Chosen.fromObject(object.chosen);
            }
            if (object.maxFrameBytes != null)
                message.maxFrameBytes = object.maxFrameBytes >>> 0;
            return message;
        };

        /**
         * Creates a plain object from an InitOk message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ai.InitOk
         * @static
         * @param {ai.InitOk} message InitOk
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        InitOk.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults) {
                object.chosen = null;
                object.maxFrameBytes = 0;
            }
            if (message.chosen != null && message.hasOwnProperty("chosen"))
                object.chosen = $root.ai.Chosen.toObject(message.chosen, options);
            if (message.maxFrameBytes != null && message.hasOwnProperty("maxFrameBytes"))
                object.maxFrameBytes = message.maxFrameBytes;
            return object;
        };

        /**
         * Converts this InitOk to JSON.
         * @function toJSON
         * @memberof ai.InitOk
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        InitOk.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for InitOk
         * @function getTypeUrl
         * @memberof ai.InitOk
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        InitOk.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/ai.InitOk";
        };

        return InitOk;
    })();

    ai.Chosen = (function() {

        /**
         * Properties of a Chosen.
         * @memberof ai
         * @interface IChosen
         * @property {ai.PixelFormat|null} [pixelFormat] Chosen pixelFormat
         * @property {ai.Codec|null} [codec] Chosen codec
         * @property {number|null} [width] Chosen width
         * @property {number|null} [height] Chosen height
         * @property {number|null} [fpsTarget] Chosen fpsTarget
         * @property {ai.Policy|null} [policy] Chosen policy
         * @property {number|null} [initialCredits] Chosen initialCredits
         * @property {number|null} [gopMs] Chosen gopMs
         * @property {string|null} [colorSpace] Chosen colorSpace
         * @property {string|null} [colorRange] Chosen colorRange
         */

        /**
         * Constructs a new Chosen.
         * @memberof ai
         * @classdesc Represents a Chosen.
         * @implements IChosen
         * @constructor
         * @param {ai.IChosen=} [properties] Properties to set
         */
        function Chosen(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Chosen pixelFormat.
         * @member {ai.PixelFormat} pixelFormat
         * @memberof ai.Chosen
         * @instance
         */
        Chosen.prototype.pixelFormat = 0;

        /**
         * Chosen codec.
         * @member {ai.Codec} codec
         * @memberof ai.Chosen
         * @instance
         */
        Chosen.prototype.codec = 0;

        /**
         * Chosen width.
         * @member {number} width
         * @memberof ai.Chosen
         * @instance
         */
        Chosen.prototype.width = 0;

        /**
         * Chosen height.
         * @member {number} height
         * @memberof ai.Chosen
         * @instance
         */
        Chosen.prototype.height = 0;

        /**
         * Chosen fpsTarget.
         * @member {number} fpsTarget
         * @memberof ai.Chosen
         * @instance
         */
        Chosen.prototype.fpsTarget = 0;

        /**
         * Chosen policy.
         * @member {ai.Policy} policy
         * @memberof ai.Chosen
         * @instance
         */
        Chosen.prototype.policy = 0;

        /**
         * Chosen initialCredits.
         * @member {number} initialCredits
         * @memberof ai.Chosen
         * @instance
         */
        Chosen.prototype.initialCredits = 0;

        /**
         * Chosen gopMs.
         * @member {number} gopMs
         * @memberof ai.Chosen
         * @instance
         */
        Chosen.prototype.gopMs = 0;

        /**
         * Chosen colorSpace.
         * @member {string} colorSpace
         * @memberof ai.Chosen
         * @instance
         */
        Chosen.prototype.colorSpace = "";

        /**
         * Chosen colorRange.
         * @member {string} colorRange
         * @memberof ai.Chosen
         * @instance
         */
        Chosen.prototype.colorRange = "";

        /**
         * Creates a new Chosen instance using the specified properties.
         * @function create
         * @memberof ai.Chosen
         * @static
         * @param {ai.IChosen=} [properties] Properties to set
         * @returns {ai.Chosen} Chosen instance
         */
        Chosen.create = function create(properties) {
            return new Chosen(properties);
        };

        /**
         * Encodes the specified Chosen message. Does not implicitly {@link ai.Chosen.verify|verify} messages.
         * @function encode
         * @memberof ai.Chosen
         * @static
         * @param {ai.IChosen} message Chosen message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Chosen.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.pixelFormat != null && Object.hasOwnProperty.call(message, "pixelFormat"))
                writer.uint32(/* id 1, wireType 0 =*/8).int32(message.pixelFormat);
            if (message.codec != null && Object.hasOwnProperty.call(message, "codec"))
                writer.uint32(/* id 2, wireType 0 =*/16).int32(message.codec);
            if (message.width != null && Object.hasOwnProperty.call(message, "width"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.width);
            if (message.height != null && Object.hasOwnProperty.call(message, "height"))
                writer.uint32(/* id 4, wireType 0 =*/32).uint32(message.height);
            if (message.fpsTarget != null && Object.hasOwnProperty.call(message, "fpsTarget"))
                writer.uint32(/* id 5, wireType 5 =*/45).float(message.fpsTarget);
            if (message.policy != null && Object.hasOwnProperty.call(message, "policy"))
                writer.uint32(/* id 6, wireType 0 =*/48).int32(message.policy);
            if (message.initialCredits != null && Object.hasOwnProperty.call(message, "initialCredits"))
                writer.uint32(/* id 7, wireType 0 =*/56).uint32(message.initialCredits);
            if (message.gopMs != null && Object.hasOwnProperty.call(message, "gopMs"))
                writer.uint32(/* id 8, wireType 0 =*/64).uint32(message.gopMs);
            if (message.colorSpace != null && Object.hasOwnProperty.call(message, "colorSpace"))
                writer.uint32(/* id 9, wireType 2 =*/74).string(message.colorSpace);
            if (message.colorRange != null && Object.hasOwnProperty.call(message, "colorRange"))
                writer.uint32(/* id 10, wireType 2 =*/82).string(message.colorRange);
            return writer;
        };

        /**
         * Encodes the specified Chosen message, length delimited. Does not implicitly {@link ai.Chosen.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ai.Chosen
         * @static
         * @param {ai.IChosen} message Chosen message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Chosen.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a Chosen message from the specified reader or buffer.
         * @function decode
         * @memberof ai.Chosen
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ai.Chosen} Chosen
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Chosen.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ai.Chosen();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.pixelFormat = reader.int32();
                        break;
                    }
                case 2: {
                        message.codec = reader.int32();
                        break;
                    }
                case 3: {
                        message.width = reader.uint32();
                        break;
                    }
                case 4: {
                        message.height = reader.uint32();
                        break;
                    }
                case 5: {
                        message.fpsTarget = reader.float();
                        break;
                    }
                case 6: {
                        message.policy = reader.int32();
                        break;
                    }
                case 7: {
                        message.initialCredits = reader.uint32();
                        break;
                    }
                case 8: {
                        message.gopMs = reader.uint32();
                        break;
                    }
                case 9: {
                        message.colorSpace = reader.string();
                        break;
                    }
                case 10: {
                        message.colorRange = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a Chosen message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ai.Chosen
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ai.Chosen} Chosen
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Chosen.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Chosen message.
         * @function verify
         * @memberof ai.Chosen
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Chosen.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.pixelFormat != null && message.hasOwnProperty("pixelFormat"))
                switch (message.pixelFormat) {
                default:
                    return "pixelFormat: enum value expected";
                case 0:
                case 1:
                case 2:
                case 3:
                    break;
                }
            if (message.codec != null && message.hasOwnProperty("codec"))
                switch (message.codec) {
                default:
                    return "codec: enum value expected";
                case 0:
                case 1:
                case 2:
                case 3:
                    break;
                }
            if (message.width != null && message.hasOwnProperty("width"))
                if (!$util.isInteger(message.width))
                    return "width: integer expected";
            if (message.height != null && message.hasOwnProperty("height"))
                if (!$util.isInteger(message.height))
                    return "height: integer expected";
            if (message.fpsTarget != null && message.hasOwnProperty("fpsTarget"))
                if (typeof message.fpsTarget !== "number")
                    return "fpsTarget: number expected";
            if (message.policy != null && message.hasOwnProperty("policy"))
                switch (message.policy) {
                default:
                    return "policy: enum value expected";
                case 0:
                case 1:
                case 2:
                    break;
                }
            if (message.initialCredits != null && message.hasOwnProperty("initialCredits"))
                if (!$util.isInteger(message.initialCredits))
                    return "initialCredits: integer expected";
            if (message.gopMs != null && message.hasOwnProperty("gopMs"))
                if (!$util.isInteger(message.gopMs))
                    return "gopMs: integer expected";
            if (message.colorSpace != null && message.hasOwnProperty("colorSpace"))
                if (!$util.isString(message.colorSpace))
                    return "colorSpace: string expected";
            if (message.colorRange != null && message.hasOwnProperty("colorRange"))
                if (!$util.isString(message.colorRange))
                    return "colorRange: string expected";
            return null;
        };

        /**
         * Creates a Chosen message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ai.Chosen
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ai.Chosen} Chosen
         */
        Chosen.fromObject = function fromObject(object) {
            if (object instanceof $root.ai.Chosen)
                return object;
            var message = new $root.ai.Chosen();
            switch (object.pixelFormat) {
            default:
                if (typeof object.pixelFormat === "number") {
                    message.pixelFormat = object.pixelFormat;
                    break;
                }
                break;
            case "PF_UNKNOWN":
            case 0:
                message.pixelFormat = 0;
                break;
            case "PF_I420":
            case 1:
                message.pixelFormat = 1;
                break;
            case "PF_NV12":
            case 2:
                message.pixelFormat = 2;
                break;
            case "PF_RGB8":
            case 3:
                message.pixelFormat = 3;
                break;
            }
            switch (object.codec) {
            default:
                if (typeof object.codec === "number") {
                    message.codec = object.codec;
                    break;
                }
                break;
            case "CODEC_UNKNOWN":
            case 0:
                message.codec = 0;
                break;
            case "CODEC_NONE":
            case 1:
                message.codec = 1;
                break;
            case "CODEC_JPEG":
            case 2:
                message.codec = 2;
                break;
            case "CODEC_H264":
            case 3:
                message.codec = 3;
                break;
            }
            if (object.width != null)
                message.width = object.width >>> 0;
            if (object.height != null)
                message.height = object.height >>> 0;
            if (object.fpsTarget != null)
                message.fpsTarget = Number(object.fpsTarget);
            switch (object.policy) {
            default:
                if (typeof object.policy === "number") {
                    message.policy = object.policy;
                    break;
                }
                break;
            case "POLICY_UNKNOWN":
            case 0:
                message.policy = 0;
                break;
            case "LATEST_WINS":
            case 1:
                message.policy = 1;
                break;
            case "FIFO":
            case 2:
                message.policy = 2;
                break;
            }
            if (object.initialCredits != null)
                message.initialCredits = object.initialCredits >>> 0;
            if (object.gopMs != null)
                message.gopMs = object.gopMs >>> 0;
            if (object.colorSpace != null)
                message.colorSpace = String(object.colorSpace);
            if (object.colorRange != null)
                message.colorRange = String(object.colorRange);
            return message;
        };

        /**
         * Creates a plain object from a Chosen message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ai.Chosen
         * @static
         * @param {ai.Chosen} message Chosen
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Chosen.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults) {
                object.pixelFormat = options.enums === String ? "PF_UNKNOWN" : 0;
                object.codec = options.enums === String ? "CODEC_UNKNOWN" : 0;
                object.width = 0;
                object.height = 0;
                object.fpsTarget = 0;
                object.policy = options.enums === String ? "POLICY_UNKNOWN" : 0;
                object.initialCredits = 0;
                object.gopMs = 0;
                object.colorSpace = "";
                object.colorRange = "";
            }
            if (message.pixelFormat != null && message.hasOwnProperty("pixelFormat"))
                object.pixelFormat = options.enums === String ? $root.ai.PixelFormat[message.pixelFormat] === undefined ? message.pixelFormat : $root.ai.PixelFormat[message.pixelFormat] : message.pixelFormat;
            if (message.codec != null && message.hasOwnProperty("codec"))
                object.codec = options.enums === String ? $root.ai.Codec[message.codec] === undefined ? message.codec : $root.ai.Codec[message.codec] : message.codec;
            if (message.width != null && message.hasOwnProperty("width"))
                object.width = message.width;
            if (message.height != null && message.hasOwnProperty("height"))
                object.height = message.height;
            if (message.fpsTarget != null && message.hasOwnProperty("fpsTarget"))
                object.fpsTarget = options.json && !isFinite(message.fpsTarget) ? String(message.fpsTarget) : message.fpsTarget;
            if (message.policy != null && message.hasOwnProperty("policy"))
                object.policy = options.enums === String ? $root.ai.Policy[message.policy] === undefined ? message.policy : $root.ai.Policy[message.policy] : message.policy;
            if (message.initialCredits != null && message.hasOwnProperty("initialCredits"))
                object.initialCredits = message.initialCredits;
            if (message.gopMs != null && message.hasOwnProperty("gopMs"))
                object.gopMs = message.gopMs;
            if (message.colorSpace != null && message.hasOwnProperty("colorSpace"))
                object.colorSpace = message.colorSpace;
            if (message.colorRange != null && message.hasOwnProperty("colorRange"))
                object.colorRange = message.colorRange;
            return object;
        };

        /**
         * Converts this Chosen to JSON.
         * @function toJSON
         * @memberof ai.Chosen
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Chosen.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Chosen
         * @function getTypeUrl
         * @memberof ai.Chosen
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Chosen.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/ai.Chosen";
        };

        return Chosen;
    })();

    ai.WindowUpdate = (function() {

        /**
         * Properties of a WindowUpdate.
         * @memberof ai
         * @interface IWindowUpdate
         * @property {number|null} [newWindowSize] WindowUpdate newWindowSize
         */

        /**
         * Constructs a new WindowUpdate.
         * @memberof ai
         * @classdesc Represents a WindowUpdate.
         * @implements IWindowUpdate
         * @constructor
         * @param {ai.IWindowUpdate=} [properties] Properties to set
         */
        function WindowUpdate(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * WindowUpdate newWindowSize.
         * @member {number} newWindowSize
         * @memberof ai.WindowUpdate
         * @instance
         */
        WindowUpdate.prototype.newWindowSize = 0;

        /**
         * Creates a new WindowUpdate instance using the specified properties.
         * @function create
         * @memberof ai.WindowUpdate
         * @static
         * @param {ai.IWindowUpdate=} [properties] Properties to set
         * @returns {ai.WindowUpdate} WindowUpdate instance
         */
        WindowUpdate.create = function create(properties) {
            return new WindowUpdate(properties);
        };

        /**
         * Encodes the specified WindowUpdate message. Does not implicitly {@link ai.WindowUpdate.verify|verify} messages.
         * @function encode
         * @memberof ai.WindowUpdate
         * @static
         * @param {ai.IWindowUpdate} message WindowUpdate message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        WindowUpdate.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.newWindowSize != null && Object.hasOwnProperty.call(message, "newWindowSize"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.newWindowSize);
            return writer;
        };

        /**
         * Encodes the specified WindowUpdate message, length delimited. Does not implicitly {@link ai.WindowUpdate.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ai.WindowUpdate
         * @static
         * @param {ai.IWindowUpdate} message WindowUpdate message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        WindowUpdate.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a WindowUpdate message from the specified reader or buffer.
         * @function decode
         * @memberof ai.WindowUpdate
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ai.WindowUpdate} WindowUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        WindowUpdate.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ai.WindowUpdate();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.newWindowSize = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a WindowUpdate message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ai.WindowUpdate
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ai.WindowUpdate} WindowUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        WindowUpdate.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a WindowUpdate message.
         * @function verify
         * @memberof ai.WindowUpdate
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        WindowUpdate.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.newWindowSize != null && message.hasOwnProperty("newWindowSize"))
                if (!$util.isInteger(message.newWindowSize))
                    return "newWindowSize: integer expected";
            return null;
        };

        /**
         * Creates a WindowUpdate message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ai.WindowUpdate
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ai.WindowUpdate} WindowUpdate
         */
        WindowUpdate.fromObject = function fromObject(object) {
            if (object instanceof $root.ai.WindowUpdate)
                return object;
            var message = new $root.ai.WindowUpdate();
            if (object.newWindowSize != null)
                message.newWindowSize = object.newWindowSize >>> 0;
            return message;
        };

        /**
         * Creates a plain object from a WindowUpdate message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ai.WindowUpdate
         * @static
         * @param {ai.WindowUpdate} message WindowUpdate
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        WindowUpdate.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults)
                object.newWindowSize = 0;
            if (message.newWindowSize != null && message.hasOwnProperty("newWindowSize"))
                object.newWindowSize = message.newWindowSize;
            return object;
        };

        /**
         * Converts this WindowUpdate to JSON.
         * @function toJSON
         * @memberof ai.WindowUpdate
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        WindowUpdate.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for WindowUpdate
         * @function getTypeUrl
         * @memberof ai.WindowUpdate
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        WindowUpdate.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/ai.WindowUpdate";
        };

        return WindowUpdate;
    })();

    ai.Result = (function() {

        /**
         * Properties of a Result.
         * @memberof ai
         * @interface IResult
         * @property {number|Long|null} [frameId] Result frameId
         * @property {ai.IFrameRef|null} [frameRef] Result frameRef
         * @property {string|null} [modelFamily] Result modelFamily
         * @property {string|null} [modelName] Result modelName
         * @property {string|null} [modelVersion] Result modelVersion
         * @property {ai.ILatency|null} [lat] Result lat
         * @property {ai.IDetectionSet|null} [detections] Result detections
         */

        /**
         * Constructs a new Result.
         * @memberof ai
         * @classdesc Represents a Result.
         * @implements IResult
         * @constructor
         * @param {ai.IResult=} [properties] Properties to set
         */
        function Result(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Result frameId.
         * @member {number|Long} frameId
         * @memberof ai.Result
         * @instance
         */
        Result.prototype.frameId = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * Result frameRef.
         * @member {ai.IFrameRef|null|undefined} frameRef
         * @memberof ai.Result
         * @instance
         */
        Result.prototype.frameRef = null;

        /**
         * Result modelFamily.
         * @member {string} modelFamily
         * @memberof ai.Result
         * @instance
         */
        Result.prototype.modelFamily = "";

        /**
         * Result modelName.
         * @member {string} modelName
         * @memberof ai.Result
         * @instance
         */
        Result.prototype.modelName = "";

        /**
         * Result modelVersion.
         * @member {string} modelVersion
         * @memberof ai.Result
         * @instance
         */
        Result.prototype.modelVersion = "";

        /**
         * Result lat.
         * @member {ai.ILatency|null|undefined} lat
         * @memberof ai.Result
         * @instance
         */
        Result.prototype.lat = null;

        /**
         * Result detections.
         * @member {ai.IDetectionSet|null|undefined} detections
         * @memberof ai.Result
         * @instance
         */
        Result.prototype.detections = null;

        // OneOf field names bound to virtual getters and setters
        var $oneOfFields;

        /**
         * Result out.
         * @member {"detections"|undefined} out
         * @memberof ai.Result
         * @instance
         */
        Object.defineProperty(Result.prototype, "out", {
            get: $util.oneOfGetter($oneOfFields = ["detections"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Creates a new Result instance using the specified properties.
         * @function create
         * @memberof ai.Result
         * @static
         * @param {ai.IResult=} [properties] Properties to set
         * @returns {ai.Result} Result instance
         */
        Result.create = function create(properties) {
            return new Result(properties);
        };

        /**
         * Encodes the specified Result message. Does not implicitly {@link ai.Result.verify|verify} messages.
         * @function encode
         * @memberof ai.Result
         * @static
         * @param {ai.IResult} message Result message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Result.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.frameId != null && Object.hasOwnProperty.call(message, "frameId"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint64(message.frameId);
            if (message.frameRef != null && Object.hasOwnProperty.call(message, "frameRef"))
                $root.ai.FrameRef.encode(message.frameRef, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            if (message.modelFamily != null && Object.hasOwnProperty.call(message, "modelFamily"))
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.modelFamily);
            if (message.modelName != null && Object.hasOwnProperty.call(message, "modelName"))
                writer.uint32(/* id 4, wireType 2 =*/34).string(message.modelName);
            if (message.modelVersion != null && Object.hasOwnProperty.call(message, "modelVersion"))
                writer.uint32(/* id 5, wireType 2 =*/42).string(message.modelVersion);
            if (message.lat != null && Object.hasOwnProperty.call(message, "lat"))
                $root.ai.Latency.encode(message.lat, writer.uint32(/* id 6, wireType 2 =*/50).fork()).ldelim();
            if (message.detections != null && Object.hasOwnProperty.call(message, "detections"))
                $root.ai.DetectionSet.encode(message.detections, writer.uint32(/* id 10, wireType 2 =*/82).fork()).ldelim();
            return writer;
        };

        /**
         * Encodes the specified Result message, length delimited. Does not implicitly {@link ai.Result.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ai.Result
         * @static
         * @param {ai.IResult} message Result message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Result.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a Result message from the specified reader or buffer.
         * @function decode
         * @memberof ai.Result
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ai.Result} Result
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Result.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ai.Result();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.frameId = reader.uint64();
                        break;
                    }
                case 2: {
                        message.frameRef = $root.ai.FrameRef.decode(reader, reader.uint32());
                        break;
                    }
                case 3: {
                        message.modelFamily = reader.string();
                        break;
                    }
                case 4: {
                        message.modelName = reader.string();
                        break;
                    }
                case 5: {
                        message.modelVersion = reader.string();
                        break;
                    }
                case 6: {
                        message.lat = $root.ai.Latency.decode(reader, reader.uint32());
                        break;
                    }
                case 10: {
                        message.detections = $root.ai.DetectionSet.decode(reader, reader.uint32());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a Result message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ai.Result
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ai.Result} Result
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Result.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Result message.
         * @function verify
         * @memberof ai.Result
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Result.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            var properties = {};
            if (message.frameId != null && message.hasOwnProperty("frameId"))
                if (!$util.isInteger(message.frameId) && !(message.frameId && $util.isInteger(message.frameId.low) && $util.isInteger(message.frameId.high)))
                    return "frameId: integer|Long expected";
            if (message.frameRef != null && message.hasOwnProperty("frameRef")) {
                var error = $root.ai.FrameRef.verify(message.frameRef);
                if (error)
                    return "frameRef." + error;
            }
            if (message.modelFamily != null && message.hasOwnProperty("modelFamily"))
                if (!$util.isString(message.modelFamily))
                    return "modelFamily: string expected";
            if (message.modelName != null && message.hasOwnProperty("modelName"))
                if (!$util.isString(message.modelName))
                    return "modelName: string expected";
            if (message.modelVersion != null && message.hasOwnProperty("modelVersion"))
                if (!$util.isString(message.modelVersion))
                    return "modelVersion: string expected";
            if (message.lat != null && message.hasOwnProperty("lat")) {
                var error = $root.ai.Latency.verify(message.lat);
                if (error)
                    return "lat." + error;
            }
            if (message.detections != null && message.hasOwnProperty("detections")) {
                properties.out = 1;
                {
                    var error = $root.ai.DetectionSet.verify(message.detections);
                    if (error)
                        return "detections." + error;
                }
            }
            return null;
        };

        /**
         * Creates a Result message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ai.Result
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ai.Result} Result
         */
        Result.fromObject = function fromObject(object) {
            if (object instanceof $root.ai.Result)
                return object;
            var message = new $root.ai.Result();
            if (object.frameId != null)
                if ($util.Long)
                    (message.frameId = $util.Long.fromValue(object.frameId)).unsigned = true;
                else if (typeof object.frameId === "string")
                    message.frameId = parseInt(object.frameId, 10);
                else if (typeof object.frameId === "number")
                    message.frameId = object.frameId;
                else if (typeof object.frameId === "object")
                    message.frameId = new $util.LongBits(object.frameId.low >>> 0, object.frameId.high >>> 0).toNumber(true);
            if (object.frameRef != null) {
                if (typeof object.frameRef !== "object")
                    throw TypeError(".ai.Result.frameRef: object expected");
                message.frameRef = $root.ai.FrameRef.fromObject(object.frameRef);
            }
            if (object.modelFamily != null)
                message.modelFamily = String(object.modelFamily);
            if (object.modelName != null)
                message.modelName = String(object.modelName);
            if (object.modelVersion != null)
                message.modelVersion = String(object.modelVersion);
            if (object.lat != null) {
                if (typeof object.lat !== "object")
                    throw TypeError(".ai.Result.lat: object expected");
                message.lat = $root.ai.Latency.fromObject(object.lat);
            }
            if (object.detections != null) {
                if (typeof object.detections !== "object")
                    throw TypeError(".ai.Result.detections: object expected");
                message.detections = $root.ai.DetectionSet.fromObject(object.detections);
            }
            return message;
        };

        /**
         * Creates a plain object from a Result message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ai.Result
         * @static
         * @param {ai.Result} message Result
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Result.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults) {
                if ($util.Long) {
                    var long = new $util.Long(0, 0, true);
                    object.frameId = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.frameId = options.longs === String ? "0" : 0;
                object.frameRef = null;
                object.modelFamily = "";
                object.modelName = "";
                object.modelVersion = "";
                object.lat = null;
            }
            if (message.frameId != null && message.hasOwnProperty("frameId"))
                if (typeof message.frameId === "number")
                    object.frameId = options.longs === String ? String(message.frameId) : message.frameId;
                else
                    object.frameId = options.longs === String ? $util.Long.prototype.toString.call(message.frameId) : options.longs === Number ? new $util.LongBits(message.frameId.low >>> 0, message.frameId.high >>> 0).toNumber(true) : message.frameId;
            if (message.frameRef != null && message.hasOwnProperty("frameRef"))
                object.frameRef = $root.ai.FrameRef.toObject(message.frameRef, options);
            if (message.modelFamily != null && message.hasOwnProperty("modelFamily"))
                object.modelFamily = message.modelFamily;
            if (message.modelName != null && message.hasOwnProperty("modelName"))
                object.modelName = message.modelName;
            if (message.modelVersion != null && message.hasOwnProperty("modelVersion"))
                object.modelVersion = message.modelVersion;
            if (message.lat != null && message.hasOwnProperty("lat"))
                object.lat = $root.ai.Latency.toObject(message.lat, options);
            if (message.detections != null && message.hasOwnProperty("detections")) {
                object.detections = $root.ai.DetectionSet.toObject(message.detections, options);
                if (options.oneofs)
                    object.out = "detections";
            }
            return object;
        };

        /**
         * Converts this Result to JSON.
         * @function toJSON
         * @memberof ai.Result
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Result.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Result
         * @function getTypeUrl
         * @memberof ai.Result
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Result.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/ai.Result";
        };

        return Result;
    })();

    ai.FrameRef = (function() {

        /**
         * Properties of a FrameRef.
         * @memberof ai
         * @interface IFrameRef
         * @property {number|Long|null} [tsMonoNs] FrameRef tsMonoNs
         * @property {number|Long|null} [tsUtcNs] FrameRef tsUtcNs
         * @property {string|null} [sessionId] FrameRef sessionId
         */

        /**
         * Constructs a new FrameRef.
         * @memberof ai
         * @classdesc Represents a FrameRef.
         * @implements IFrameRef
         * @constructor
         * @param {ai.IFrameRef=} [properties] Properties to set
         */
        function FrameRef(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * FrameRef tsMonoNs.
         * @member {number|Long} tsMonoNs
         * @memberof ai.FrameRef
         * @instance
         */
        FrameRef.prototype.tsMonoNs = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * FrameRef tsUtcNs.
         * @member {number|Long} tsUtcNs
         * @memberof ai.FrameRef
         * @instance
         */
        FrameRef.prototype.tsUtcNs = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * FrameRef sessionId.
         * @member {string} sessionId
         * @memberof ai.FrameRef
         * @instance
         */
        FrameRef.prototype.sessionId = "";

        /**
         * Creates a new FrameRef instance using the specified properties.
         * @function create
         * @memberof ai.FrameRef
         * @static
         * @param {ai.IFrameRef=} [properties] Properties to set
         * @returns {ai.FrameRef} FrameRef instance
         */
        FrameRef.create = function create(properties) {
            return new FrameRef(properties);
        };

        /**
         * Encodes the specified FrameRef message. Does not implicitly {@link ai.FrameRef.verify|verify} messages.
         * @function encode
         * @memberof ai.FrameRef
         * @static
         * @param {ai.IFrameRef} message FrameRef message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        FrameRef.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.tsMonoNs != null && Object.hasOwnProperty.call(message, "tsMonoNs"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint64(message.tsMonoNs);
            if (message.tsUtcNs != null && Object.hasOwnProperty.call(message, "tsUtcNs"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint64(message.tsUtcNs);
            if (message.sessionId != null && Object.hasOwnProperty.call(message, "sessionId"))
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.sessionId);
            return writer;
        };

        /**
         * Encodes the specified FrameRef message, length delimited. Does not implicitly {@link ai.FrameRef.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ai.FrameRef
         * @static
         * @param {ai.IFrameRef} message FrameRef message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        FrameRef.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a FrameRef message from the specified reader or buffer.
         * @function decode
         * @memberof ai.FrameRef
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ai.FrameRef} FrameRef
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        FrameRef.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ai.FrameRef();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.tsMonoNs = reader.uint64();
                        break;
                    }
                case 2: {
                        message.tsUtcNs = reader.uint64();
                        break;
                    }
                case 3: {
                        message.sessionId = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a FrameRef message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ai.FrameRef
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ai.FrameRef} FrameRef
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        FrameRef.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a FrameRef message.
         * @function verify
         * @memberof ai.FrameRef
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        FrameRef.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.tsMonoNs != null && message.hasOwnProperty("tsMonoNs"))
                if (!$util.isInteger(message.tsMonoNs) && !(message.tsMonoNs && $util.isInteger(message.tsMonoNs.low) && $util.isInteger(message.tsMonoNs.high)))
                    return "tsMonoNs: integer|Long expected";
            if (message.tsUtcNs != null && message.hasOwnProperty("tsUtcNs"))
                if (!$util.isInteger(message.tsUtcNs) && !(message.tsUtcNs && $util.isInteger(message.tsUtcNs.low) && $util.isInteger(message.tsUtcNs.high)))
                    return "tsUtcNs: integer|Long expected";
            if (message.sessionId != null && message.hasOwnProperty("sessionId"))
                if (!$util.isString(message.sessionId))
                    return "sessionId: string expected";
            return null;
        };

        /**
         * Creates a FrameRef message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ai.FrameRef
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ai.FrameRef} FrameRef
         */
        FrameRef.fromObject = function fromObject(object) {
            if (object instanceof $root.ai.FrameRef)
                return object;
            var message = new $root.ai.FrameRef();
            if (object.tsMonoNs != null)
                if ($util.Long)
                    (message.tsMonoNs = $util.Long.fromValue(object.tsMonoNs)).unsigned = true;
                else if (typeof object.tsMonoNs === "string")
                    message.tsMonoNs = parseInt(object.tsMonoNs, 10);
                else if (typeof object.tsMonoNs === "number")
                    message.tsMonoNs = object.tsMonoNs;
                else if (typeof object.tsMonoNs === "object")
                    message.tsMonoNs = new $util.LongBits(object.tsMonoNs.low >>> 0, object.tsMonoNs.high >>> 0).toNumber(true);
            if (object.tsUtcNs != null)
                if ($util.Long)
                    (message.tsUtcNs = $util.Long.fromValue(object.tsUtcNs)).unsigned = true;
                else if (typeof object.tsUtcNs === "string")
                    message.tsUtcNs = parseInt(object.tsUtcNs, 10);
                else if (typeof object.tsUtcNs === "number")
                    message.tsUtcNs = object.tsUtcNs;
                else if (typeof object.tsUtcNs === "object")
                    message.tsUtcNs = new $util.LongBits(object.tsUtcNs.low >>> 0, object.tsUtcNs.high >>> 0).toNumber(true);
            if (object.sessionId != null)
                message.sessionId = String(object.sessionId);
            return message;
        };

        /**
         * Creates a plain object from a FrameRef message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ai.FrameRef
         * @static
         * @param {ai.FrameRef} message FrameRef
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        FrameRef.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults) {
                if ($util.Long) {
                    var long = new $util.Long(0, 0, true);
                    object.tsMonoNs = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.tsMonoNs = options.longs === String ? "0" : 0;
                if ($util.Long) {
                    var long = new $util.Long(0, 0, true);
                    object.tsUtcNs = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.tsUtcNs = options.longs === String ? "0" : 0;
                object.sessionId = "";
            }
            if (message.tsMonoNs != null && message.hasOwnProperty("tsMonoNs"))
                if (typeof message.tsMonoNs === "number")
                    object.tsMonoNs = options.longs === String ? String(message.tsMonoNs) : message.tsMonoNs;
                else
                    object.tsMonoNs = options.longs === String ? $util.Long.prototype.toString.call(message.tsMonoNs) : options.longs === Number ? new $util.LongBits(message.tsMonoNs.low >>> 0, message.tsMonoNs.high >>> 0).toNumber(true) : message.tsMonoNs;
            if (message.tsUtcNs != null && message.hasOwnProperty("tsUtcNs"))
                if (typeof message.tsUtcNs === "number")
                    object.tsUtcNs = options.longs === String ? String(message.tsUtcNs) : message.tsUtcNs;
                else
                    object.tsUtcNs = options.longs === String ? $util.Long.prototype.toString.call(message.tsUtcNs) : options.longs === Number ? new $util.LongBits(message.tsUtcNs.low >>> 0, message.tsUtcNs.high >>> 0).toNumber(true) : message.tsUtcNs;
            if (message.sessionId != null && message.hasOwnProperty("sessionId"))
                object.sessionId = message.sessionId;
            return object;
        };

        /**
         * Converts this FrameRef to JSON.
         * @function toJSON
         * @memberof ai.FrameRef
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        FrameRef.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for FrameRef
         * @function getTypeUrl
         * @memberof ai.FrameRef
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        FrameRef.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/ai.FrameRef";
        };

        return FrameRef;
    })();

    ai.Latency = (function() {

        /**
         * Properties of a Latency.
         * @memberof ai
         * @interface ILatency
         * @property {number|null} [preMs] Latency preMs
         * @property {number|null} [inferMs] Latency inferMs
         * @property {number|null} [postMs] Latency postMs
         * @property {number|null} [totalMs] Latency totalMs
         */

        /**
         * Constructs a new Latency.
         * @memberof ai
         * @classdesc Represents a Latency.
         * @implements ILatency
         * @constructor
         * @param {ai.ILatency=} [properties] Properties to set
         */
        function Latency(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Latency preMs.
         * @member {number} preMs
         * @memberof ai.Latency
         * @instance
         */
        Latency.prototype.preMs = 0;

        /**
         * Latency inferMs.
         * @member {number} inferMs
         * @memberof ai.Latency
         * @instance
         */
        Latency.prototype.inferMs = 0;

        /**
         * Latency postMs.
         * @member {number} postMs
         * @memberof ai.Latency
         * @instance
         */
        Latency.prototype.postMs = 0;

        /**
         * Latency totalMs.
         * @member {number} totalMs
         * @memberof ai.Latency
         * @instance
         */
        Latency.prototype.totalMs = 0;

        /**
         * Creates a new Latency instance using the specified properties.
         * @function create
         * @memberof ai.Latency
         * @static
         * @param {ai.ILatency=} [properties] Properties to set
         * @returns {ai.Latency} Latency instance
         */
        Latency.create = function create(properties) {
            return new Latency(properties);
        };

        /**
         * Encodes the specified Latency message. Does not implicitly {@link ai.Latency.verify|verify} messages.
         * @function encode
         * @memberof ai.Latency
         * @static
         * @param {ai.ILatency} message Latency message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Latency.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.preMs != null && Object.hasOwnProperty.call(message, "preMs"))
                writer.uint32(/* id 1, wireType 5 =*/13).float(message.preMs);
            if (message.inferMs != null && Object.hasOwnProperty.call(message, "inferMs"))
                writer.uint32(/* id 2, wireType 5 =*/21).float(message.inferMs);
            if (message.postMs != null && Object.hasOwnProperty.call(message, "postMs"))
                writer.uint32(/* id 3, wireType 5 =*/29).float(message.postMs);
            if (message.totalMs != null && Object.hasOwnProperty.call(message, "totalMs"))
                writer.uint32(/* id 4, wireType 5 =*/37).float(message.totalMs);
            return writer;
        };

        /**
         * Encodes the specified Latency message, length delimited. Does not implicitly {@link ai.Latency.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ai.Latency
         * @static
         * @param {ai.ILatency} message Latency message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Latency.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a Latency message from the specified reader or buffer.
         * @function decode
         * @memberof ai.Latency
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ai.Latency} Latency
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Latency.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ai.Latency();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.preMs = reader.float();
                        break;
                    }
                case 2: {
                        message.inferMs = reader.float();
                        break;
                    }
                case 3: {
                        message.postMs = reader.float();
                        break;
                    }
                case 4: {
                        message.totalMs = reader.float();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a Latency message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ai.Latency
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ai.Latency} Latency
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Latency.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Latency message.
         * @function verify
         * @memberof ai.Latency
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Latency.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.preMs != null && message.hasOwnProperty("preMs"))
                if (typeof message.preMs !== "number")
                    return "preMs: number expected";
            if (message.inferMs != null && message.hasOwnProperty("inferMs"))
                if (typeof message.inferMs !== "number")
                    return "inferMs: number expected";
            if (message.postMs != null && message.hasOwnProperty("postMs"))
                if (typeof message.postMs !== "number")
                    return "postMs: number expected";
            if (message.totalMs != null && message.hasOwnProperty("totalMs"))
                if (typeof message.totalMs !== "number")
                    return "totalMs: number expected";
            return null;
        };

        /**
         * Creates a Latency message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ai.Latency
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ai.Latency} Latency
         */
        Latency.fromObject = function fromObject(object) {
            if (object instanceof $root.ai.Latency)
                return object;
            var message = new $root.ai.Latency();
            if (object.preMs != null)
                message.preMs = Number(object.preMs);
            if (object.inferMs != null)
                message.inferMs = Number(object.inferMs);
            if (object.postMs != null)
                message.postMs = Number(object.postMs);
            if (object.totalMs != null)
                message.totalMs = Number(object.totalMs);
            return message;
        };

        /**
         * Creates a plain object from a Latency message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ai.Latency
         * @static
         * @param {ai.Latency} message Latency
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Latency.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults) {
                object.preMs = 0;
                object.inferMs = 0;
                object.postMs = 0;
                object.totalMs = 0;
            }
            if (message.preMs != null && message.hasOwnProperty("preMs"))
                object.preMs = options.json && !isFinite(message.preMs) ? String(message.preMs) : message.preMs;
            if (message.inferMs != null && message.hasOwnProperty("inferMs"))
                object.inferMs = options.json && !isFinite(message.inferMs) ? String(message.inferMs) : message.inferMs;
            if (message.postMs != null && message.hasOwnProperty("postMs"))
                object.postMs = options.json && !isFinite(message.postMs) ? String(message.postMs) : message.postMs;
            if (message.totalMs != null && message.hasOwnProperty("totalMs"))
                object.totalMs = options.json && !isFinite(message.totalMs) ? String(message.totalMs) : message.totalMs;
            return object;
        };

        /**
         * Converts this Latency to JSON.
         * @function toJSON
         * @memberof ai.Latency
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Latency.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Latency
         * @function getTypeUrl
         * @memberof ai.Latency
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Latency.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/ai.Latency";
        };

        return Latency;
    })();

    ai.DetectionSet = (function() {

        /**
         * Properties of a DetectionSet.
         * @memberof ai
         * @interface IDetectionSet
         * @property {Array.<ai.IDetection>|null} [items] DetectionSet items
         */

        /**
         * Constructs a new DetectionSet.
         * @memberof ai
         * @classdesc Represents a DetectionSet.
         * @implements IDetectionSet
         * @constructor
         * @param {ai.IDetectionSet=} [properties] Properties to set
         */
        function DetectionSet(properties) {
            this.items = [];
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * DetectionSet items.
         * @member {Array.<ai.IDetection>} items
         * @memberof ai.DetectionSet
         * @instance
         */
        DetectionSet.prototype.items = $util.emptyArray;

        /**
         * Creates a new DetectionSet instance using the specified properties.
         * @function create
         * @memberof ai.DetectionSet
         * @static
         * @param {ai.IDetectionSet=} [properties] Properties to set
         * @returns {ai.DetectionSet} DetectionSet instance
         */
        DetectionSet.create = function create(properties) {
            return new DetectionSet(properties);
        };

        /**
         * Encodes the specified DetectionSet message. Does not implicitly {@link ai.DetectionSet.verify|verify} messages.
         * @function encode
         * @memberof ai.DetectionSet
         * @static
         * @param {ai.IDetectionSet} message DetectionSet message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        DetectionSet.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.items != null && message.items.length)
                for (var i = 0; i < message.items.length; ++i)
                    $root.ai.Detection.encode(message.items[i], writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            return writer;
        };

        /**
         * Encodes the specified DetectionSet message, length delimited. Does not implicitly {@link ai.DetectionSet.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ai.DetectionSet
         * @static
         * @param {ai.IDetectionSet} message DetectionSet message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        DetectionSet.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a DetectionSet message from the specified reader or buffer.
         * @function decode
         * @memberof ai.DetectionSet
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ai.DetectionSet} DetectionSet
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        DetectionSet.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ai.DetectionSet();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.items && message.items.length))
                            message.items = [];
                        message.items.push($root.ai.Detection.decode(reader, reader.uint32()));
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a DetectionSet message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ai.DetectionSet
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ai.DetectionSet} DetectionSet
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        DetectionSet.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a DetectionSet message.
         * @function verify
         * @memberof ai.DetectionSet
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        DetectionSet.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.items != null && message.hasOwnProperty("items")) {
                if (!Array.isArray(message.items))
                    return "items: array expected";
                for (var i = 0; i < message.items.length; ++i) {
                    var error = $root.ai.Detection.verify(message.items[i]);
                    if (error)
                        return "items." + error;
                }
            }
            return null;
        };

        /**
         * Creates a DetectionSet message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ai.DetectionSet
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ai.DetectionSet} DetectionSet
         */
        DetectionSet.fromObject = function fromObject(object) {
            if (object instanceof $root.ai.DetectionSet)
                return object;
            var message = new $root.ai.DetectionSet();
            if (object.items) {
                if (!Array.isArray(object.items))
                    throw TypeError(".ai.DetectionSet.items: array expected");
                message.items = [];
                for (var i = 0; i < object.items.length; ++i) {
                    if (typeof object.items[i] !== "object")
                        throw TypeError(".ai.DetectionSet.items: object expected");
                    message.items[i] = $root.ai.Detection.fromObject(object.items[i]);
                }
            }
            return message;
        };

        /**
         * Creates a plain object from a DetectionSet message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ai.DetectionSet
         * @static
         * @param {ai.DetectionSet} message DetectionSet
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        DetectionSet.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.arrays || options.defaults)
                object.items = [];
            if (message.items && message.items.length) {
                object.items = [];
                for (var j = 0; j < message.items.length; ++j)
                    object.items[j] = $root.ai.Detection.toObject(message.items[j], options);
            }
            return object;
        };

        /**
         * Converts this DetectionSet to JSON.
         * @function toJSON
         * @memberof ai.DetectionSet
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        DetectionSet.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for DetectionSet
         * @function getTypeUrl
         * @memberof ai.DetectionSet
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        DetectionSet.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/ai.DetectionSet";
        };

        return DetectionSet;
    })();

    ai.Detection = (function() {

        /**
         * Properties of a Detection.
         * @memberof ai
         * @interface IDetection
         * @property {ai.IBBox|null} [bbox] Detection bbox
         * @property {number|null} [conf] Detection conf
         * @property {string|null} [cls] Detection cls
         * @property {string|null} [trackId] Detection trackId
         */

        /**
         * Constructs a new Detection.
         * @memberof ai
         * @classdesc Represents a Detection.
         * @implements IDetection
         * @constructor
         * @param {ai.IDetection=} [properties] Properties to set
         */
        function Detection(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Detection bbox.
         * @member {ai.IBBox|null|undefined} bbox
         * @memberof ai.Detection
         * @instance
         */
        Detection.prototype.bbox = null;

        /**
         * Detection conf.
         * @member {number} conf
         * @memberof ai.Detection
         * @instance
         */
        Detection.prototype.conf = 0;

        /**
         * Detection cls.
         * @member {string} cls
         * @memberof ai.Detection
         * @instance
         */
        Detection.prototype.cls = "";

        /**
         * Detection trackId.
         * @member {string} trackId
         * @memberof ai.Detection
         * @instance
         */
        Detection.prototype.trackId = "";

        /**
         * Creates a new Detection instance using the specified properties.
         * @function create
         * @memberof ai.Detection
         * @static
         * @param {ai.IDetection=} [properties] Properties to set
         * @returns {ai.Detection} Detection instance
         */
        Detection.create = function create(properties) {
            return new Detection(properties);
        };

        /**
         * Encodes the specified Detection message. Does not implicitly {@link ai.Detection.verify|verify} messages.
         * @function encode
         * @memberof ai.Detection
         * @static
         * @param {ai.IDetection} message Detection message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Detection.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.bbox != null && Object.hasOwnProperty.call(message, "bbox"))
                $root.ai.BBox.encode(message.bbox, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.conf != null && Object.hasOwnProperty.call(message, "conf"))
                writer.uint32(/* id 2, wireType 5 =*/21).float(message.conf);
            if (message.cls != null && Object.hasOwnProperty.call(message, "cls"))
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.cls);
            if (message.trackId != null && Object.hasOwnProperty.call(message, "trackId"))
                writer.uint32(/* id 4, wireType 2 =*/34).string(message.trackId);
            return writer;
        };

        /**
         * Encodes the specified Detection message, length delimited. Does not implicitly {@link ai.Detection.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ai.Detection
         * @static
         * @param {ai.IDetection} message Detection message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Detection.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a Detection message from the specified reader or buffer.
         * @function decode
         * @memberof ai.Detection
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ai.Detection} Detection
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Detection.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ai.Detection();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.bbox = $root.ai.BBox.decode(reader, reader.uint32());
                        break;
                    }
                case 2: {
                        message.conf = reader.float();
                        break;
                    }
                case 3: {
                        message.cls = reader.string();
                        break;
                    }
                case 4: {
                        message.trackId = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a Detection message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ai.Detection
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ai.Detection} Detection
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Detection.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Detection message.
         * @function verify
         * @memberof ai.Detection
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Detection.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.bbox != null && message.hasOwnProperty("bbox")) {
                var error = $root.ai.BBox.verify(message.bbox);
                if (error)
                    return "bbox." + error;
            }
            if (message.conf != null && message.hasOwnProperty("conf"))
                if (typeof message.conf !== "number")
                    return "conf: number expected";
            if (message.cls != null && message.hasOwnProperty("cls"))
                if (!$util.isString(message.cls))
                    return "cls: string expected";
            if (message.trackId != null && message.hasOwnProperty("trackId"))
                if (!$util.isString(message.trackId))
                    return "trackId: string expected";
            return null;
        };

        /**
         * Creates a Detection message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ai.Detection
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ai.Detection} Detection
         */
        Detection.fromObject = function fromObject(object) {
            if (object instanceof $root.ai.Detection)
                return object;
            var message = new $root.ai.Detection();
            if (object.bbox != null) {
                if (typeof object.bbox !== "object")
                    throw TypeError(".ai.Detection.bbox: object expected");
                message.bbox = $root.ai.BBox.fromObject(object.bbox);
            }
            if (object.conf != null)
                message.conf = Number(object.conf);
            if (object.cls != null)
                message.cls = String(object.cls);
            if (object.trackId != null)
                message.trackId = String(object.trackId);
            return message;
        };

        /**
         * Creates a plain object from a Detection message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ai.Detection
         * @static
         * @param {ai.Detection} message Detection
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Detection.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults) {
                object.bbox = null;
                object.conf = 0;
                object.cls = "";
                object.trackId = "";
            }
            if (message.bbox != null && message.hasOwnProperty("bbox"))
                object.bbox = $root.ai.BBox.toObject(message.bbox, options);
            if (message.conf != null && message.hasOwnProperty("conf"))
                object.conf = options.json && !isFinite(message.conf) ? String(message.conf) : message.conf;
            if (message.cls != null && message.hasOwnProperty("cls"))
                object.cls = message.cls;
            if (message.trackId != null && message.hasOwnProperty("trackId"))
                object.trackId = message.trackId;
            return object;
        };

        /**
         * Converts this Detection to JSON.
         * @function toJSON
         * @memberof ai.Detection
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Detection.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Detection
         * @function getTypeUrl
         * @memberof ai.Detection
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Detection.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/ai.Detection";
        };

        return Detection;
    })();

    ai.BBox = (function() {

        /**
         * Properties of a BBox.
         * @memberof ai
         * @interface IBBox
         * @property {number|null} [x1] BBox x1
         * @property {number|null} [y1] BBox y1
         * @property {number|null} [x2] BBox x2
         * @property {number|null} [y2] BBox y2
         */

        /**
         * Constructs a new BBox.
         * @memberof ai
         * @classdesc Represents a BBox.
         * @implements IBBox
         * @constructor
         * @param {ai.IBBox=} [properties] Properties to set
         */
        function BBox(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * BBox x1.
         * @member {number} x1
         * @memberof ai.BBox
         * @instance
         */
        BBox.prototype.x1 = 0;

        /**
         * BBox y1.
         * @member {number} y1
         * @memberof ai.BBox
         * @instance
         */
        BBox.prototype.y1 = 0;

        /**
         * BBox x2.
         * @member {number} x2
         * @memberof ai.BBox
         * @instance
         */
        BBox.prototype.x2 = 0;

        /**
         * BBox y2.
         * @member {number} y2
         * @memberof ai.BBox
         * @instance
         */
        BBox.prototype.y2 = 0;

        /**
         * Creates a new BBox instance using the specified properties.
         * @function create
         * @memberof ai.BBox
         * @static
         * @param {ai.IBBox=} [properties] Properties to set
         * @returns {ai.BBox} BBox instance
         */
        BBox.create = function create(properties) {
            return new BBox(properties);
        };

        /**
         * Encodes the specified BBox message. Does not implicitly {@link ai.BBox.verify|verify} messages.
         * @function encode
         * @memberof ai.BBox
         * @static
         * @param {ai.IBBox} message BBox message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        BBox.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.x1 != null && Object.hasOwnProperty.call(message, "x1"))
                writer.uint32(/* id 1, wireType 5 =*/13).float(message.x1);
            if (message.y1 != null && Object.hasOwnProperty.call(message, "y1"))
                writer.uint32(/* id 2, wireType 5 =*/21).float(message.y1);
            if (message.x2 != null && Object.hasOwnProperty.call(message, "x2"))
                writer.uint32(/* id 3, wireType 5 =*/29).float(message.x2);
            if (message.y2 != null && Object.hasOwnProperty.call(message, "y2"))
                writer.uint32(/* id 4, wireType 5 =*/37).float(message.y2);
            return writer;
        };

        /**
         * Encodes the specified BBox message, length delimited. Does not implicitly {@link ai.BBox.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ai.BBox
         * @static
         * @param {ai.IBBox} message BBox message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        BBox.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a BBox message from the specified reader or buffer.
         * @function decode
         * @memberof ai.BBox
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ai.BBox} BBox
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        BBox.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ai.BBox();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.x1 = reader.float();
                        break;
                    }
                case 2: {
                        message.y1 = reader.float();
                        break;
                    }
                case 3: {
                        message.x2 = reader.float();
                        break;
                    }
                case 4: {
                        message.y2 = reader.float();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a BBox message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ai.BBox
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ai.BBox} BBox
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        BBox.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a BBox message.
         * @function verify
         * @memberof ai.BBox
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        BBox.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.x1 != null && message.hasOwnProperty("x1"))
                if (typeof message.x1 !== "number")
                    return "x1: number expected";
            if (message.y1 != null && message.hasOwnProperty("y1"))
                if (typeof message.y1 !== "number")
                    return "y1: number expected";
            if (message.x2 != null && message.hasOwnProperty("x2"))
                if (typeof message.x2 !== "number")
                    return "x2: number expected";
            if (message.y2 != null && message.hasOwnProperty("y2"))
                if (typeof message.y2 !== "number")
                    return "y2: number expected";
            return null;
        };

        /**
         * Creates a BBox message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ai.BBox
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ai.BBox} BBox
         */
        BBox.fromObject = function fromObject(object) {
            if (object instanceof $root.ai.BBox)
                return object;
            var message = new $root.ai.BBox();
            if (object.x1 != null)
                message.x1 = Number(object.x1);
            if (object.y1 != null)
                message.y1 = Number(object.y1);
            if (object.x2 != null)
                message.x2 = Number(object.x2);
            if (object.y2 != null)
                message.y2 = Number(object.y2);
            return message;
        };

        /**
         * Creates a plain object from a BBox message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ai.BBox
         * @static
         * @param {ai.BBox} message BBox
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        BBox.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults) {
                object.x1 = 0;
                object.y1 = 0;
                object.x2 = 0;
                object.y2 = 0;
            }
            if (message.x1 != null && message.hasOwnProperty("x1"))
                object.x1 = options.json && !isFinite(message.x1) ? String(message.x1) : message.x1;
            if (message.y1 != null && message.hasOwnProperty("y1"))
                object.y1 = options.json && !isFinite(message.y1) ? String(message.y1) : message.y1;
            if (message.x2 != null && message.hasOwnProperty("x2"))
                object.x2 = options.json && !isFinite(message.x2) ? String(message.x2) : message.x2;
            if (message.y2 != null && message.hasOwnProperty("y2"))
                object.y2 = options.json && !isFinite(message.y2) ? String(message.y2) : message.y2;
            return object;
        };

        /**
         * Converts this BBox to JSON.
         * @function toJSON
         * @memberof ai.BBox
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        BBox.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for BBox
         * @function getTypeUrl
         * @memberof ai.BBox
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        BBox.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/ai.BBox";
        };

        return BBox;
    })();

    ai.Error = (function() {

        /**
         * Properties of an Error.
         * @memberof ai
         * @interface IError
         * @property {ai.ErrorCode|null} [code] Error code
         * @property {string|null} [message] Error message
         * @property {number|null} [retryAfterMs] Error retryAfterMs
         */

        /**
         * Constructs a new Error.
         * @memberof ai
         * @classdesc Represents an Error.
         * @implements IError
         * @constructor
         * @param {ai.IError=} [properties] Properties to set
         */
        function Error(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Error code.
         * @member {ai.ErrorCode} code
         * @memberof ai.Error
         * @instance
         */
        Error.prototype.code = 0;

        /**
         * Error message.
         * @member {string} message
         * @memberof ai.Error
         * @instance
         */
        Error.prototype.message = "";

        /**
         * Error retryAfterMs.
         * @member {number} retryAfterMs
         * @memberof ai.Error
         * @instance
         */
        Error.prototype.retryAfterMs = 0;

        /**
         * Creates a new Error instance using the specified properties.
         * @function create
         * @memberof ai.Error
         * @static
         * @param {ai.IError=} [properties] Properties to set
         * @returns {ai.Error} Error instance
         */
        Error.create = function create(properties) {
            return new Error(properties);
        };

        /**
         * Encodes the specified Error message. Does not implicitly {@link ai.Error.verify|verify} messages.
         * @function encode
         * @memberof ai.Error
         * @static
         * @param {ai.IError} message Error message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Error.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.code != null && Object.hasOwnProperty.call(message, "code"))
                writer.uint32(/* id 1, wireType 0 =*/8).int32(message.code);
            if (message.message != null && Object.hasOwnProperty.call(message, "message"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.message);
            if (message.retryAfterMs != null && Object.hasOwnProperty.call(message, "retryAfterMs"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.retryAfterMs);
            return writer;
        };

        /**
         * Encodes the specified Error message, length delimited. Does not implicitly {@link ai.Error.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ai.Error
         * @static
         * @param {ai.IError} message Error message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Error.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes an Error message from the specified reader or buffer.
         * @function decode
         * @memberof ai.Error
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ai.Error} Error
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Error.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ai.Error();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.code = reader.int32();
                        break;
                    }
                case 2: {
                        message.message = reader.string();
                        break;
                    }
                case 3: {
                        message.retryAfterMs = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes an Error message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ai.Error
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ai.Error} Error
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Error.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies an Error message.
         * @function verify
         * @memberof ai.Error
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Error.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.code != null && message.hasOwnProperty("code"))
                switch (message.code) {
                default:
                    return "code: enum value expected";
                case 0:
                case 1:
                case 2:
                case 3:
                case 4:
                case 5:
                case 6:
                case 7:
                case 8:
                case 9:
                case 10:
                    break;
                }
            if (message.message != null && message.hasOwnProperty("message"))
                if (!$util.isString(message.message))
                    return "message: string expected";
            if (message.retryAfterMs != null && message.hasOwnProperty("retryAfterMs"))
                if (!$util.isInteger(message.retryAfterMs))
                    return "retryAfterMs: integer expected";
            return null;
        };

        /**
         * Creates an Error message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ai.Error
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ai.Error} Error
         */
        Error.fromObject = function fromObject(object) {
            if (object instanceof $root.ai.Error)
                return object;
            var message = new $root.ai.Error();
            switch (object.code) {
            default:
                if (typeof object.code === "number") {
                    message.code = object.code;
                    break;
                }
                break;
            case "ERR_UNKNOWN":
            case 0:
                message.code = 0;
                break;
            case "VERSION_UNSUPPORTED":
            case 1:
                message.code = 1;
                break;
            case "BAD_MESSAGE":
            case 2:
                message.code = 2;
                break;
            case "BAD_SEQUENCE":
            case 3:
                message.code = 3;
                break;
            case "UNSUPPORTED_FORMAT":
            case 4:
                message.code = 4;
                break;
            case "INVALID_FRAME":
            case 5:
                message.code = 5;
                break;
            case "FRAME_TOO_LARGE":
            case 6:
                message.code = 6;
                break;
            case "MODEL_NOT_READY":
            case 7:
                message.code = 7;
                break;
            case "OOM":
            case 8:
                message.code = 8;
                break;
            case "BACKPRESSURE_TIMEOUT":
            case 9:
                message.code = 9;
                break;
            case "INTERNAL":
            case 10:
                message.code = 10;
                break;
            }
            if (object.message != null)
                message.message = String(object.message);
            if (object.retryAfterMs != null)
                message.retryAfterMs = object.retryAfterMs >>> 0;
            return message;
        };

        /**
         * Creates a plain object from an Error message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ai.Error
         * @static
         * @param {ai.Error} message Error
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Error.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults) {
                object.code = options.enums === String ? "ERR_UNKNOWN" : 0;
                object.message = "";
                object.retryAfterMs = 0;
            }
            if (message.code != null && message.hasOwnProperty("code"))
                object.code = options.enums === String ? $root.ai.ErrorCode[message.code] === undefined ? message.code : $root.ai.ErrorCode[message.code] : message.code;
            if (message.message != null && message.hasOwnProperty("message"))
                object.message = message.message;
            if (message.retryAfterMs != null && message.hasOwnProperty("retryAfterMs"))
                object.retryAfterMs = message.retryAfterMs;
            return object;
        };

        /**
         * Converts this Error to JSON.
         * @function toJSON
         * @memberof ai.Error
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Error.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Error
         * @function getTypeUrl
         * @memberof ai.Error
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Error.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/ai.Error";
        };

        return Error;
    })();

    ai.Heartbeat = (function() {

        /**
         * Properties of a Heartbeat.
         * @memberof ai
         * @interface IHeartbeat
         * @property {number|Long|null} [lastFrameId] Heartbeat lastFrameId
         * @property {number|Long|null} [tx] Heartbeat tx
         * @property {number|Long|null} [rx] Heartbeat rx
         */

        /**
         * Constructs a new Heartbeat.
         * @memberof ai
         * @classdesc Represents a Heartbeat.
         * @implements IHeartbeat
         * @constructor
         * @param {ai.IHeartbeat=} [properties] Properties to set
         */
        function Heartbeat(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Heartbeat lastFrameId.
         * @member {number|Long} lastFrameId
         * @memberof ai.Heartbeat
         * @instance
         */
        Heartbeat.prototype.lastFrameId = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * Heartbeat tx.
         * @member {number|Long} tx
         * @memberof ai.Heartbeat
         * @instance
         */
        Heartbeat.prototype.tx = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * Heartbeat rx.
         * @member {number|Long} rx
         * @memberof ai.Heartbeat
         * @instance
         */
        Heartbeat.prototype.rx = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * Creates a new Heartbeat instance using the specified properties.
         * @function create
         * @memberof ai.Heartbeat
         * @static
         * @param {ai.IHeartbeat=} [properties] Properties to set
         * @returns {ai.Heartbeat} Heartbeat instance
         */
        Heartbeat.create = function create(properties) {
            return new Heartbeat(properties);
        };

        /**
         * Encodes the specified Heartbeat message. Does not implicitly {@link ai.Heartbeat.verify|verify} messages.
         * @function encode
         * @memberof ai.Heartbeat
         * @static
         * @param {ai.IHeartbeat} message Heartbeat message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Heartbeat.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.lastFrameId != null && Object.hasOwnProperty.call(message, "lastFrameId"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint64(message.lastFrameId);
            if (message.tx != null && Object.hasOwnProperty.call(message, "tx"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint64(message.tx);
            if (message.rx != null && Object.hasOwnProperty.call(message, "rx"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint64(message.rx);
            return writer;
        };

        /**
         * Encodes the specified Heartbeat message, length delimited. Does not implicitly {@link ai.Heartbeat.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ai.Heartbeat
         * @static
         * @param {ai.IHeartbeat} message Heartbeat message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Heartbeat.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a Heartbeat message from the specified reader or buffer.
         * @function decode
         * @memberof ai.Heartbeat
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ai.Heartbeat} Heartbeat
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Heartbeat.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ai.Heartbeat();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.lastFrameId = reader.uint64();
                        break;
                    }
                case 2: {
                        message.tx = reader.uint64();
                        break;
                    }
                case 3: {
                        message.rx = reader.uint64();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a Heartbeat message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ai.Heartbeat
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ai.Heartbeat} Heartbeat
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Heartbeat.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Heartbeat message.
         * @function verify
         * @memberof ai.Heartbeat
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Heartbeat.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.lastFrameId != null && message.hasOwnProperty("lastFrameId"))
                if (!$util.isInteger(message.lastFrameId) && !(message.lastFrameId && $util.isInteger(message.lastFrameId.low) && $util.isInteger(message.lastFrameId.high)))
                    return "lastFrameId: integer|Long expected";
            if (message.tx != null && message.hasOwnProperty("tx"))
                if (!$util.isInteger(message.tx) && !(message.tx && $util.isInteger(message.tx.low) && $util.isInteger(message.tx.high)))
                    return "tx: integer|Long expected";
            if (message.rx != null && message.hasOwnProperty("rx"))
                if (!$util.isInteger(message.rx) && !(message.rx && $util.isInteger(message.rx.low) && $util.isInteger(message.rx.high)))
                    return "rx: integer|Long expected";
            return null;
        };

        /**
         * Creates a Heartbeat message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ai.Heartbeat
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ai.Heartbeat} Heartbeat
         */
        Heartbeat.fromObject = function fromObject(object) {
            if (object instanceof $root.ai.Heartbeat)
                return object;
            var message = new $root.ai.Heartbeat();
            if (object.lastFrameId != null)
                if ($util.Long)
                    (message.lastFrameId = $util.Long.fromValue(object.lastFrameId)).unsigned = true;
                else if (typeof object.lastFrameId === "string")
                    message.lastFrameId = parseInt(object.lastFrameId, 10);
                else if (typeof object.lastFrameId === "number")
                    message.lastFrameId = object.lastFrameId;
                else if (typeof object.lastFrameId === "object")
                    message.lastFrameId = new $util.LongBits(object.lastFrameId.low >>> 0, object.lastFrameId.high >>> 0).toNumber(true);
            if (object.tx != null)
                if ($util.Long)
                    (message.tx = $util.Long.fromValue(object.tx)).unsigned = true;
                else if (typeof object.tx === "string")
                    message.tx = parseInt(object.tx, 10);
                else if (typeof object.tx === "number")
                    message.tx = object.tx;
                else if (typeof object.tx === "object")
                    message.tx = new $util.LongBits(object.tx.low >>> 0, object.tx.high >>> 0).toNumber(true);
            if (object.rx != null)
                if ($util.Long)
                    (message.rx = $util.Long.fromValue(object.rx)).unsigned = true;
                else if (typeof object.rx === "string")
                    message.rx = parseInt(object.rx, 10);
                else if (typeof object.rx === "number")
                    message.rx = object.rx;
                else if (typeof object.rx === "object")
                    message.rx = new $util.LongBits(object.rx.low >>> 0, object.rx.high >>> 0).toNumber(true);
            return message;
        };

        /**
         * Creates a plain object from a Heartbeat message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ai.Heartbeat
         * @static
         * @param {ai.Heartbeat} message Heartbeat
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Heartbeat.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults) {
                if ($util.Long) {
                    var long = new $util.Long(0, 0, true);
                    object.lastFrameId = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.lastFrameId = options.longs === String ? "0" : 0;
                if ($util.Long) {
                    var long = new $util.Long(0, 0, true);
                    object.tx = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.tx = options.longs === String ? "0" : 0;
                if ($util.Long) {
                    var long = new $util.Long(0, 0, true);
                    object.rx = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.rx = options.longs === String ? "0" : 0;
            }
            if (message.lastFrameId != null && message.hasOwnProperty("lastFrameId"))
                if (typeof message.lastFrameId === "number")
                    object.lastFrameId = options.longs === String ? String(message.lastFrameId) : message.lastFrameId;
                else
                    object.lastFrameId = options.longs === String ? $util.Long.prototype.toString.call(message.lastFrameId) : options.longs === Number ? new $util.LongBits(message.lastFrameId.low >>> 0, message.lastFrameId.high >>> 0).toNumber(true) : message.lastFrameId;
            if (message.tx != null && message.hasOwnProperty("tx"))
                if (typeof message.tx === "number")
                    object.tx = options.longs === String ? String(message.tx) : message.tx;
                else
                    object.tx = options.longs === String ? $util.Long.prototype.toString.call(message.tx) : options.longs === Number ? new $util.LongBits(message.tx.low >>> 0, message.tx.high >>> 0).toNumber(true) : message.tx;
            if (message.rx != null && message.hasOwnProperty("rx"))
                if (typeof message.rx === "number")
                    object.rx = options.longs === String ? String(message.rx) : message.rx;
                else
                    object.rx = options.longs === String ? $util.Long.prototype.toString.call(message.rx) : options.longs === Number ? new $util.LongBits(message.rx.low >>> 0, message.rx.high >>> 0).toNumber(true) : message.rx;
            return object;
        };

        /**
         * Converts this Heartbeat to JSON.
         * @function toJSON
         * @memberof ai.Heartbeat
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Heartbeat.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Heartbeat
         * @function getTypeUrl
         * @memberof ai.Heartbeat
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Heartbeat.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/ai.Heartbeat";
        };

        return Heartbeat;
    })();

    return ai;
})();

module.exports = $root;
