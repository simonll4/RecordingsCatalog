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
            if (message.req != null && Object.hasOwnProperty.call(message, "req"))
                $root.ai.Request.encode(message.req, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.res != null && Object.hasOwnProperty.call(message, "res"))
                $root.ai.Response.encode(message.res, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            if (message.hb != null && Object.hasOwnProperty.call(message, "hb"))
                $root.ai.Heartbeat.encode(message.hb, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
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
                        message.req = $root.ai.Request.decode(reader, reader.uint32());
                        break;
                    }
                case 2: {
                        message.res = $root.ai.Response.decode(reader, reader.uint32());
                        break;
                    }
                case 3: {
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

    ai.Request = (function() {

        /**
         * Properties of a Request.
         * @memberof ai
         * @interface IRequest
         * @property {ai.IInit|null} [init] Request init
         * @property {ai.IFrame|null} [frame] Request frame
         * @property {ai.IShutdown|null} [shutdown] Request shutdown
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
         * Request shutdown.
         * @member {ai.IShutdown|null|undefined} shutdown
         * @memberof ai.Request
         * @instance
         */
        Request.prototype.shutdown = null;

        // OneOf field names bound to virtual getters and setters
        var $oneOfFields;

        /**
         * Request kind.
         * @member {"init"|"frame"|"shutdown"|undefined} kind
         * @memberof ai.Request
         * @instance
         */
        Object.defineProperty(Request.prototype, "kind", {
            get: $util.oneOfGetter($oneOfFields = ["init", "frame", "shutdown"]),
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
            if (message.shutdown != null && Object.hasOwnProperty.call(message, "shutdown"))
                $root.ai.Shutdown.encode(message.shutdown, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
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
                        message.shutdown = $root.ai.Shutdown.decode(reader, reader.uint32());
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
            if (message.shutdown != null && message.hasOwnProperty("shutdown")) {
                if (properties.kind === 1)
                    return "kind: multiple values";
                properties.kind = 1;
                {
                    var error = $root.ai.Shutdown.verify(message.shutdown);
                    if (error)
                        return "shutdown." + error;
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
            if (object.shutdown != null) {
                if (typeof object.shutdown !== "object")
                    throw TypeError(".ai.Request.shutdown: object expected");
                message.shutdown = $root.ai.Shutdown.fromObject(object.shutdown);
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
            if (message.shutdown != null && message.hasOwnProperty("shutdown")) {
                object.shutdown = $root.ai.Shutdown.toObject(message.shutdown, options);
                if (options.oneofs)
                    object.kind = "shutdown";
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
         * @property {string|null} [modelPath] Init modelPath
         * @property {number|null} [width] Init width
         * @property {number|null} [height] Init height
         * @property {number|null} [confThreshold] Init confThreshold
         * @property {Array.<number>|null} [classesFilter] Init classesFilter
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
            this.classesFilter = [];
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Init modelPath.
         * @member {string} modelPath
         * @memberof ai.Init
         * @instance
         */
        Init.prototype.modelPath = "";

        /**
         * Init width.
         * @member {number} width
         * @memberof ai.Init
         * @instance
         */
        Init.prototype.width = 0;

        /**
         * Init height.
         * @member {number} height
         * @memberof ai.Init
         * @instance
         */
        Init.prototype.height = 0;

        /**
         * Init confThreshold.
         * @member {number} confThreshold
         * @memberof ai.Init
         * @instance
         */
        Init.prototype.confThreshold = 0;

        /**
         * Init classesFilter.
         * @member {Array.<number>} classesFilter
         * @memberof ai.Init
         * @instance
         */
        Init.prototype.classesFilter = $util.emptyArray;

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
            if (message.modelPath != null && Object.hasOwnProperty.call(message, "modelPath"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.modelPath);
            if (message.width != null && Object.hasOwnProperty.call(message, "width"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.width);
            if (message.height != null && Object.hasOwnProperty.call(message, "height"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.height);
            if (message.confThreshold != null && Object.hasOwnProperty.call(message, "confThreshold"))
                writer.uint32(/* id 4, wireType 5 =*/37).float(message.confThreshold);
            if (message.classesFilter != null && message.classesFilter.length) {
                writer.uint32(/* id 5, wireType 2 =*/42).fork();
                for (var i = 0; i < message.classesFilter.length; ++i)
                    writer.uint32(message.classesFilter[i]);
                writer.ldelim();
            }
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
                        message.modelPath = reader.string();
                        break;
                    }
                case 2: {
                        message.width = reader.uint32();
                        break;
                    }
                case 3: {
                        message.height = reader.uint32();
                        break;
                    }
                case 4: {
                        message.confThreshold = reader.float();
                        break;
                    }
                case 5: {
                        if (!(message.classesFilter && message.classesFilter.length))
                            message.classesFilter = [];
                        if ((tag & 7) === 2) {
                            var end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2)
                                message.classesFilter.push(reader.uint32());
                        } else
                            message.classesFilter.push(reader.uint32());
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
            if (message.modelPath != null && message.hasOwnProperty("modelPath"))
                if (!$util.isString(message.modelPath))
                    return "modelPath: string expected";
            if (message.width != null && message.hasOwnProperty("width"))
                if (!$util.isInteger(message.width))
                    return "width: integer expected";
            if (message.height != null && message.hasOwnProperty("height"))
                if (!$util.isInteger(message.height))
                    return "height: integer expected";
            if (message.confThreshold != null && message.hasOwnProperty("confThreshold"))
                if (typeof message.confThreshold !== "number")
                    return "confThreshold: number expected";
            if (message.classesFilter != null && message.hasOwnProperty("classesFilter")) {
                if (!Array.isArray(message.classesFilter))
                    return "classesFilter: array expected";
                for (var i = 0; i < message.classesFilter.length; ++i)
                    if (!$util.isInteger(message.classesFilter[i]))
                        return "classesFilter: integer[] expected";
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
            if (object.modelPath != null)
                message.modelPath = String(object.modelPath);
            if (object.width != null)
                message.width = object.width >>> 0;
            if (object.height != null)
                message.height = object.height >>> 0;
            if (object.confThreshold != null)
                message.confThreshold = Number(object.confThreshold);
            if (object.classesFilter) {
                if (!Array.isArray(object.classesFilter))
                    throw TypeError(".ai.Init.classesFilter: array expected");
                message.classesFilter = [];
                for (var i = 0; i < object.classesFilter.length; ++i)
                    message.classesFilter[i] = object.classesFilter[i] >>> 0;
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
            if (options.arrays || options.defaults)
                object.classesFilter = [];
            if (options.defaults) {
                object.modelPath = "";
                object.width = 0;
                object.height = 0;
                object.confThreshold = 0;
            }
            if (message.modelPath != null && message.hasOwnProperty("modelPath"))
                object.modelPath = message.modelPath;
            if (message.width != null && message.hasOwnProperty("width"))
                object.width = message.width;
            if (message.height != null && message.hasOwnProperty("height"))
                object.height = message.height;
            if (message.confThreshold != null && message.hasOwnProperty("confThreshold"))
                object.confThreshold = options.json && !isFinite(message.confThreshold) ? String(message.confThreshold) : message.confThreshold;
            if (message.classesFilter && message.classesFilter.length) {
                object.classesFilter = [];
                for (var j = 0; j < message.classesFilter.length; ++j)
                    object.classesFilter[j] = message.classesFilter[j];
            }
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

    ai.Frame = (function() {

        /**
         * Properties of a Frame.
         * @memberof ai
         * @interface IFrame
         * @property {number|Long|null} [seq] Frame seq
         * @property {string|null} [tsIso] Frame tsIso
         * @property {number|Long|null} [tsMonoNs] Frame tsMonoNs
         * @property {number|null} [width] Frame width
         * @property {number|null} [height] Frame height
         * @property {string|null} [pixFmt] Frame pixFmt
         * @property {Uint8Array|null} [data] Frame data
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
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Frame seq.
         * @member {number|Long} seq
         * @memberof ai.Frame
         * @instance
         */
        Frame.prototype.seq = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * Frame tsIso.
         * @member {string} tsIso
         * @memberof ai.Frame
         * @instance
         */
        Frame.prototype.tsIso = "";

        /**
         * Frame tsMonoNs.
         * @member {number|Long} tsMonoNs
         * @memberof ai.Frame
         * @instance
         */
        Frame.prototype.tsMonoNs = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

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
         * Frame pixFmt.
         * @member {string} pixFmt
         * @memberof ai.Frame
         * @instance
         */
        Frame.prototype.pixFmt = "";

        /**
         * Frame data.
         * @member {Uint8Array} data
         * @memberof ai.Frame
         * @instance
         */
        Frame.prototype.data = $util.newBuffer([]);

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
            if (message.seq != null && Object.hasOwnProperty.call(message, "seq"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint64(message.seq);
            if (message.tsIso != null && Object.hasOwnProperty.call(message, "tsIso"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.tsIso);
            if (message.tsMonoNs != null && Object.hasOwnProperty.call(message, "tsMonoNs"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint64(message.tsMonoNs);
            if (message.width != null && Object.hasOwnProperty.call(message, "width"))
                writer.uint32(/* id 4, wireType 0 =*/32).uint32(message.width);
            if (message.height != null && Object.hasOwnProperty.call(message, "height"))
                writer.uint32(/* id 5, wireType 0 =*/40).uint32(message.height);
            if (message.pixFmt != null && Object.hasOwnProperty.call(message, "pixFmt"))
                writer.uint32(/* id 6, wireType 2 =*/50).string(message.pixFmt);
            if (message.data != null && Object.hasOwnProperty.call(message, "data"))
                writer.uint32(/* id 7, wireType 2 =*/58).bytes(message.data);
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
                        message.seq = reader.uint64();
                        break;
                    }
                case 2: {
                        message.tsIso = reader.string();
                        break;
                    }
                case 3: {
                        message.tsMonoNs = reader.uint64();
                        break;
                    }
                case 4: {
                        message.width = reader.uint32();
                        break;
                    }
                case 5: {
                        message.height = reader.uint32();
                        break;
                    }
                case 6: {
                        message.pixFmt = reader.string();
                        break;
                    }
                case 7: {
                        message.data = reader.bytes();
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
            if (message.seq != null && message.hasOwnProperty("seq"))
                if (!$util.isInteger(message.seq) && !(message.seq && $util.isInteger(message.seq.low) && $util.isInteger(message.seq.high)))
                    return "seq: integer|Long expected";
            if (message.tsIso != null && message.hasOwnProperty("tsIso"))
                if (!$util.isString(message.tsIso))
                    return "tsIso: string expected";
            if (message.tsMonoNs != null && message.hasOwnProperty("tsMonoNs"))
                if (!$util.isInteger(message.tsMonoNs) && !(message.tsMonoNs && $util.isInteger(message.tsMonoNs.low) && $util.isInteger(message.tsMonoNs.high)))
                    return "tsMonoNs: integer|Long expected";
            if (message.width != null && message.hasOwnProperty("width"))
                if (!$util.isInteger(message.width))
                    return "width: integer expected";
            if (message.height != null && message.hasOwnProperty("height"))
                if (!$util.isInteger(message.height))
                    return "height: integer expected";
            if (message.pixFmt != null && message.hasOwnProperty("pixFmt"))
                if (!$util.isString(message.pixFmt))
                    return "pixFmt: string expected";
            if (message.data != null && message.hasOwnProperty("data"))
                if (!(message.data && typeof message.data.length === "number" || $util.isString(message.data)))
                    return "data: buffer expected";
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
            if (object.seq != null)
                if ($util.Long)
                    (message.seq = $util.Long.fromValue(object.seq)).unsigned = true;
                else if (typeof object.seq === "string")
                    message.seq = parseInt(object.seq, 10);
                else if (typeof object.seq === "number")
                    message.seq = object.seq;
                else if (typeof object.seq === "object")
                    message.seq = new $util.LongBits(object.seq.low >>> 0, object.seq.high >>> 0).toNumber(true);
            if (object.tsIso != null)
                message.tsIso = String(object.tsIso);
            if (object.tsMonoNs != null)
                if ($util.Long)
                    (message.tsMonoNs = $util.Long.fromValue(object.tsMonoNs)).unsigned = true;
                else if (typeof object.tsMonoNs === "string")
                    message.tsMonoNs = parseInt(object.tsMonoNs, 10);
                else if (typeof object.tsMonoNs === "number")
                    message.tsMonoNs = object.tsMonoNs;
                else if (typeof object.tsMonoNs === "object")
                    message.tsMonoNs = new $util.LongBits(object.tsMonoNs.low >>> 0, object.tsMonoNs.high >>> 0).toNumber(true);
            if (object.width != null)
                message.width = object.width >>> 0;
            if (object.height != null)
                message.height = object.height >>> 0;
            if (object.pixFmt != null)
                message.pixFmt = String(object.pixFmt);
            if (object.data != null)
                if (typeof object.data === "string")
                    $util.base64.decode(object.data, message.data = $util.newBuffer($util.base64.length(object.data)), 0);
                else if (object.data.length >= 0)
                    message.data = object.data;
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
            if (options.defaults) {
                if ($util.Long) {
                    var long = new $util.Long(0, 0, true);
                    object.seq = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.seq = options.longs === String ? "0" : 0;
                object.tsIso = "";
                if ($util.Long) {
                    var long = new $util.Long(0, 0, true);
                    object.tsMonoNs = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.tsMonoNs = options.longs === String ? "0" : 0;
                object.width = 0;
                object.height = 0;
                object.pixFmt = "";
                if (options.bytes === String)
                    object.data = "";
                else {
                    object.data = [];
                    if (options.bytes !== Array)
                        object.data = $util.newBuffer(object.data);
                }
            }
            if (message.seq != null && message.hasOwnProperty("seq"))
                if (typeof message.seq === "number")
                    object.seq = options.longs === String ? String(message.seq) : message.seq;
                else
                    object.seq = options.longs === String ? $util.Long.prototype.toString.call(message.seq) : options.longs === Number ? new $util.LongBits(message.seq.low >>> 0, message.seq.high >>> 0).toNumber(true) : message.seq;
            if (message.tsIso != null && message.hasOwnProperty("tsIso"))
                object.tsIso = message.tsIso;
            if (message.tsMonoNs != null && message.hasOwnProperty("tsMonoNs"))
                if (typeof message.tsMonoNs === "number")
                    object.tsMonoNs = options.longs === String ? String(message.tsMonoNs) : message.tsMonoNs;
                else
                    object.tsMonoNs = options.longs === String ? $util.Long.prototype.toString.call(message.tsMonoNs) : options.longs === Number ? new $util.LongBits(message.tsMonoNs.low >>> 0, message.tsMonoNs.high >>> 0).toNumber(true) : message.tsMonoNs;
            if (message.width != null && message.hasOwnProperty("width"))
                object.width = message.width;
            if (message.height != null && message.hasOwnProperty("height"))
                object.height = message.height;
            if (message.pixFmt != null && message.hasOwnProperty("pixFmt"))
                object.pixFmt = message.pixFmt;
            if (message.data != null && message.hasOwnProperty("data"))
                object.data = options.bytes === String ? $util.base64.encode(message.data, 0, message.data.length) : options.bytes === Array ? Array.prototype.slice.call(message.data) : message.data;
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

    ai.Shutdown = (function() {

        /**
         * Properties of a Shutdown.
         * @memberof ai
         * @interface IShutdown
         */

        /**
         * Constructs a new Shutdown.
         * @memberof ai
         * @classdesc Represents a Shutdown.
         * @implements IShutdown
         * @constructor
         * @param {ai.IShutdown=} [properties] Properties to set
         */
        function Shutdown(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Creates a new Shutdown instance using the specified properties.
         * @function create
         * @memberof ai.Shutdown
         * @static
         * @param {ai.IShutdown=} [properties] Properties to set
         * @returns {ai.Shutdown} Shutdown instance
         */
        Shutdown.create = function create(properties) {
            return new Shutdown(properties);
        };

        /**
         * Encodes the specified Shutdown message. Does not implicitly {@link ai.Shutdown.verify|verify} messages.
         * @function encode
         * @memberof ai.Shutdown
         * @static
         * @param {ai.IShutdown} message Shutdown message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Shutdown.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            return writer;
        };

        /**
         * Encodes the specified Shutdown message, length delimited. Does not implicitly {@link ai.Shutdown.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ai.Shutdown
         * @static
         * @param {ai.IShutdown} message Shutdown message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Shutdown.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a Shutdown message from the specified reader or buffer.
         * @function decode
         * @memberof ai.Shutdown
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ai.Shutdown} Shutdown
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Shutdown.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ai.Shutdown();
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
         * Decodes a Shutdown message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ai.Shutdown
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ai.Shutdown} Shutdown
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Shutdown.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Shutdown message.
         * @function verify
         * @memberof ai.Shutdown
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Shutdown.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            return null;
        };

        /**
         * Creates a Shutdown message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ai.Shutdown
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ai.Shutdown} Shutdown
         */
        Shutdown.fromObject = function fromObject(object) {
            if (object instanceof $root.ai.Shutdown)
                return object;
            return new $root.ai.Shutdown();
        };

        /**
         * Creates a plain object from a Shutdown message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ai.Shutdown
         * @static
         * @param {ai.Shutdown} message Shutdown
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Shutdown.toObject = function toObject() {
            return {};
        };

        /**
         * Converts this Shutdown to JSON.
         * @function toJSON
         * @memberof ai.Shutdown
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Shutdown.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Shutdown
         * @function getTypeUrl
         * @memberof ai.Shutdown
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Shutdown.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/ai.Shutdown";
        };

        return Shutdown;
    })();

    ai.Response = (function() {

        /**
         * Properties of a Response.
         * @memberof ai
         * @interface IResponse
         * @property {ai.IInitOk|null} [initOk] Response initOk
         * @property {ai.IReady|null} [ready] Response ready
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
         * Response ready.
         * @member {ai.IReady|null|undefined} ready
         * @memberof ai.Response
         * @instance
         */
        Response.prototype.ready = null;

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
         * @member {"initOk"|"ready"|"result"|"error"|undefined} kind
         * @memberof ai.Response
         * @instance
         */
        Object.defineProperty(Response.prototype, "kind", {
            get: $util.oneOfGetter($oneOfFields = ["initOk", "ready", "result", "error"]),
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
            if (message.ready != null && Object.hasOwnProperty.call(message, "ready"))
                $root.ai.Ready.encode(message.ready, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
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
                        message.ready = $root.ai.Ready.decode(reader, reader.uint32());
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
            if (message.ready != null && message.hasOwnProperty("ready")) {
                if (properties.kind === 1)
                    return "kind: multiple values";
                properties.kind = 1;
                {
                    var error = $root.ai.Ready.verify(message.ready);
                    if (error)
                        return "ready." + error;
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
            if (object.ready != null) {
                if (typeof object.ready !== "object")
                    throw TypeError(".ai.Response.ready: object expected");
                message.ready = $root.ai.Ready.fromObject(object.ready);
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
            if (message.ready != null && message.hasOwnProperty("ready")) {
                object.ready = $root.ai.Ready.toObject(message.ready, options);
                if (options.oneofs)
                    object.kind = "ready";
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
         * @property {string|null} [runtime] InitOk runtime
         * @property {string|null} [modelVersion] InitOk modelVersion
         * @property {Array.<string>|null} [classNames] InitOk classNames
         * @property {number|null} [maxFrameBytes] InitOk maxFrameBytes
         * @property {Array.<string>|null} [providers] InitOk providers
         * @property {string|null} [modelId] InitOk modelId
         * @property {ai.IPreprocessing|null} [preproc] InitOk preproc
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
            this.classNames = [];
            this.providers = [];
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * InitOk runtime.
         * @member {string} runtime
         * @memberof ai.InitOk
         * @instance
         */
        InitOk.prototype.runtime = "";

        /**
         * InitOk modelVersion.
         * @member {string} modelVersion
         * @memberof ai.InitOk
         * @instance
         */
        InitOk.prototype.modelVersion = "";

        /**
         * InitOk classNames.
         * @member {Array.<string>} classNames
         * @memberof ai.InitOk
         * @instance
         */
        InitOk.prototype.classNames = $util.emptyArray;

        /**
         * InitOk maxFrameBytes.
         * @member {number} maxFrameBytes
         * @memberof ai.InitOk
         * @instance
         */
        InitOk.prototype.maxFrameBytes = 0;

        /**
         * InitOk providers.
         * @member {Array.<string>} providers
         * @memberof ai.InitOk
         * @instance
         */
        InitOk.prototype.providers = $util.emptyArray;

        /**
         * InitOk modelId.
         * @member {string} modelId
         * @memberof ai.InitOk
         * @instance
         */
        InitOk.prototype.modelId = "";

        /**
         * InitOk preproc.
         * @member {ai.IPreprocessing|null|undefined} preproc
         * @memberof ai.InitOk
         * @instance
         */
        InitOk.prototype.preproc = null;

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
            if (message.runtime != null && Object.hasOwnProperty.call(message, "runtime"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.runtime);
            if (message.modelVersion != null && Object.hasOwnProperty.call(message, "modelVersion"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.modelVersion);
            if (message.classNames != null && message.classNames.length)
                for (var i = 0; i < message.classNames.length; ++i)
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.classNames[i]);
            if (message.maxFrameBytes != null && Object.hasOwnProperty.call(message, "maxFrameBytes"))
                writer.uint32(/* id 4, wireType 0 =*/32).uint32(message.maxFrameBytes);
            if (message.providers != null && message.providers.length)
                for (var i = 0; i < message.providers.length; ++i)
                    writer.uint32(/* id 5, wireType 2 =*/42).string(message.providers[i]);
            if (message.modelId != null && Object.hasOwnProperty.call(message, "modelId"))
                writer.uint32(/* id 6, wireType 2 =*/50).string(message.modelId);
            if (message.preproc != null && Object.hasOwnProperty.call(message, "preproc"))
                $root.ai.Preprocessing.encode(message.preproc, writer.uint32(/* id 7, wireType 2 =*/58).fork()).ldelim();
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
                        message.runtime = reader.string();
                        break;
                    }
                case 2: {
                        message.modelVersion = reader.string();
                        break;
                    }
                case 3: {
                        if (!(message.classNames && message.classNames.length))
                            message.classNames = [];
                        message.classNames.push(reader.string());
                        break;
                    }
                case 4: {
                        message.maxFrameBytes = reader.uint32();
                        break;
                    }
                case 5: {
                        if (!(message.providers && message.providers.length))
                            message.providers = [];
                        message.providers.push(reader.string());
                        break;
                    }
                case 6: {
                        message.modelId = reader.string();
                        break;
                    }
                case 7: {
                        message.preproc = $root.ai.Preprocessing.decode(reader, reader.uint32());
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
            if (message.runtime != null && message.hasOwnProperty("runtime"))
                if (!$util.isString(message.runtime))
                    return "runtime: string expected";
            if (message.modelVersion != null && message.hasOwnProperty("modelVersion"))
                if (!$util.isString(message.modelVersion))
                    return "modelVersion: string expected";
            if (message.classNames != null && message.hasOwnProperty("classNames")) {
                if (!Array.isArray(message.classNames))
                    return "classNames: array expected";
                for (var i = 0; i < message.classNames.length; ++i)
                    if (!$util.isString(message.classNames[i]))
                        return "classNames: string[] expected";
            }
            if (message.maxFrameBytes != null && message.hasOwnProperty("maxFrameBytes"))
                if (!$util.isInteger(message.maxFrameBytes))
                    return "maxFrameBytes: integer expected";
            if (message.providers != null && message.hasOwnProperty("providers")) {
                if (!Array.isArray(message.providers))
                    return "providers: array expected";
                for (var i = 0; i < message.providers.length; ++i)
                    if (!$util.isString(message.providers[i]))
                        return "providers: string[] expected";
            }
            if (message.modelId != null && message.hasOwnProperty("modelId"))
                if (!$util.isString(message.modelId))
                    return "modelId: string expected";
            if (message.preproc != null && message.hasOwnProperty("preproc")) {
                var error = $root.ai.Preprocessing.verify(message.preproc);
                if (error)
                    return "preproc." + error;
            }
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
            if (object.runtime != null)
                message.runtime = String(object.runtime);
            if (object.modelVersion != null)
                message.modelVersion = String(object.modelVersion);
            if (object.classNames) {
                if (!Array.isArray(object.classNames))
                    throw TypeError(".ai.InitOk.classNames: array expected");
                message.classNames = [];
                for (var i = 0; i < object.classNames.length; ++i)
                    message.classNames[i] = String(object.classNames[i]);
            }
            if (object.maxFrameBytes != null)
                message.maxFrameBytes = object.maxFrameBytes >>> 0;
            if (object.providers) {
                if (!Array.isArray(object.providers))
                    throw TypeError(".ai.InitOk.providers: array expected");
                message.providers = [];
                for (var i = 0; i < object.providers.length; ++i)
                    message.providers[i] = String(object.providers[i]);
            }
            if (object.modelId != null)
                message.modelId = String(object.modelId);
            if (object.preproc != null) {
                if (typeof object.preproc !== "object")
                    throw TypeError(".ai.InitOk.preproc: object expected");
                message.preproc = $root.ai.Preprocessing.fromObject(object.preproc);
            }
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
            if (options.arrays || options.defaults) {
                object.classNames = [];
                object.providers = [];
            }
            if (options.defaults) {
                object.runtime = "";
                object.modelVersion = "";
                object.maxFrameBytes = 0;
                object.modelId = "";
                object.preproc = null;
            }
            if (message.runtime != null && message.hasOwnProperty("runtime"))
                object.runtime = message.runtime;
            if (message.modelVersion != null && message.hasOwnProperty("modelVersion"))
                object.modelVersion = message.modelVersion;
            if (message.classNames && message.classNames.length) {
                object.classNames = [];
                for (var j = 0; j < message.classNames.length; ++j)
                    object.classNames[j] = message.classNames[j];
            }
            if (message.maxFrameBytes != null && message.hasOwnProperty("maxFrameBytes"))
                object.maxFrameBytes = message.maxFrameBytes;
            if (message.providers && message.providers.length) {
                object.providers = [];
                for (var j = 0; j < message.providers.length; ++j)
                    object.providers[j] = message.providers[j];
            }
            if (message.modelId != null && message.hasOwnProperty("modelId"))
                object.modelId = message.modelId;
            if (message.preproc != null && message.hasOwnProperty("preproc"))
                object.preproc = $root.ai.Preprocessing.toObject(message.preproc, options);
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

    ai.Preprocessing = (function() {

        /**
         * Properties of a Preprocessing.
         * @memberof ai
         * @interface IPreprocessing
         * @property {string|null} [layout] Preprocessing layout
         * @property {Array.<number>|null} [mean] Preprocessing mean
         * @property {Array.<number>|null} [std] Preprocessing std
         * @property {boolean|null} [letterbox] Preprocessing letterbox
         */

        /**
         * Constructs a new Preprocessing.
         * @memberof ai
         * @classdesc Represents a Preprocessing.
         * @implements IPreprocessing
         * @constructor
         * @param {ai.IPreprocessing=} [properties] Properties to set
         */
        function Preprocessing(properties) {
            this.mean = [];
            this.std = [];
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Preprocessing layout.
         * @member {string} layout
         * @memberof ai.Preprocessing
         * @instance
         */
        Preprocessing.prototype.layout = "";

        /**
         * Preprocessing mean.
         * @member {Array.<number>} mean
         * @memberof ai.Preprocessing
         * @instance
         */
        Preprocessing.prototype.mean = $util.emptyArray;

        /**
         * Preprocessing std.
         * @member {Array.<number>} std
         * @memberof ai.Preprocessing
         * @instance
         */
        Preprocessing.prototype.std = $util.emptyArray;

        /**
         * Preprocessing letterbox.
         * @member {boolean} letterbox
         * @memberof ai.Preprocessing
         * @instance
         */
        Preprocessing.prototype.letterbox = false;

        /**
         * Creates a new Preprocessing instance using the specified properties.
         * @function create
         * @memberof ai.Preprocessing
         * @static
         * @param {ai.IPreprocessing=} [properties] Properties to set
         * @returns {ai.Preprocessing} Preprocessing instance
         */
        Preprocessing.create = function create(properties) {
            return new Preprocessing(properties);
        };

        /**
         * Encodes the specified Preprocessing message. Does not implicitly {@link ai.Preprocessing.verify|verify} messages.
         * @function encode
         * @memberof ai.Preprocessing
         * @static
         * @param {ai.IPreprocessing} message Preprocessing message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Preprocessing.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.layout != null && Object.hasOwnProperty.call(message, "layout"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.layout);
            if (message.mean != null && message.mean.length) {
                writer.uint32(/* id 2, wireType 2 =*/18).fork();
                for (var i = 0; i < message.mean.length; ++i)
                    writer.float(message.mean[i]);
                writer.ldelim();
            }
            if (message.std != null && message.std.length) {
                writer.uint32(/* id 3, wireType 2 =*/26).fork();
                for (var i = 0; i < message.std.length; ++i)
                    writer.float(message.std[i]);
                writer.ldelim();
            }
            if (message.letterbox != null && Object.hasOwnProperty.call(message, "letterbox"))
                writer.uint32(/* id 4, wireType 0 =*/32).bool(message.letterbox);
            return writer;
        };

        /**
         * Encodes the specified Preprocessing message, length delimited. Does not implicitly {@link ai.Preprocessing.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ai.Preprocessing
         * @static
         * @param {ai.IPreprocessing} message Preprocessing message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Preprocessing.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a Preprocessing message from the specified reader or buffer.
         * @function decode
         * @memberof ai.Preprocessing
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ai.Preprocessing} Preprocessing
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Preprocessing.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ai.Preprocessing();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.layout = reader.string();
                        break;
                    }
                case 2: {
                        if (!(message.mean && message.mean.length))
                            message.mean = [];
                        if ((tag & 7) === 2) {
                            var end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2)
                                message.mean.push(reader.float());
                        } else
                            message.mean.push(reader.float());
                        break;
                    }
                case 3: {
                        if (!(message.std && message.std.length))
                            message.std = [];
                        if ((tag & 7) === 2) {
                            var end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2)
                                message.std.push(reader.float());
                        } else
                            message.std.push(reader.float());
                        break;
                    }
                case 4: {
                        message.letterbox = reader.bool();
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
         * Decodes a Preprocessing message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ai.Preprocessing
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ai.Preprocessing} Preprocessing
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Preprocessing.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Preprocessing message.
         * @function verify
         * @memberof ai.Preprocessing
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Preprocessing.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.layout != null && message.hasOwnProperty("layout"))
                if (!$util.isString(message.layout))
                    return "layout: string expected";
            if (message.mean != null && message.hasOwnProperty("mean")) {
                if (!Array.isArray(message.mean))
                    return "mean: array expected";
                for (var i = 0; i < message.mean.length; ++i)
                    if (typeof message.mean[i] !== "number")
                        return "mean: number[] expected";
            }
            if (message.std != null && message.hasOwnProperty("std")) {
                if (!Array.isArray(message.std))
                    return "std: array expected";
                for (var i = 0; i < message.std.length; ++i)
                    if (typeof message.std[i] !== "number")
                        return "std: number[] expected";
            }
            if (message.letterbox != null && message.hasOwnProperty("letterbox"))
                if (typeof message.letterbox !== "boolean")
                    return "letterbox: boolean expected";
            return null;
        };

        /**
         * Creates a Preprocessing message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ai.Preprocessing
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ai.Preprocessing} Preprocessing
         */
        Preprocessing.fromObject = function fromObject(object) {
            if (object instanceof $root.ai.Preprocessing)
                return object;
            var message = new $root.ai.Preprocessing();
            if (object.layout != null)
                message.layout = String(object.layout);
            if (object.mean) {
                if (!Array.isArray(object.mean))
                    throw TypeError(".ai.Preprocessing.mean: array expected");
                message.mean = [];
                for (var i = 0; i < object.mean.length; ++i)
                    message.mean[i] = Number(object.mean[i]);
            }
            if (object.std) {
                if (!Array.isArray(object.std))
                    throw TypeError(".ai.Preprocessing.std: array expected");
                message.std = [];
                for (var i = 0; i < object.std.length; ++i)
                    message.std[i] = Number(object.std[i]);
            }
            if (object.letterbox != null)
                message.letterbox = Boolean(object.letterbox);
            return message;
        };

        /**
         * Creates a plain object from a Preprocessing message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ai.Preprocessing
         * @static
         * @param {ai.Preprocessing} message Preprocessing
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Preprocessing.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.arrays || options.defaults) {
                object.mean = [];
                object.std = [];
            }
            if (options.defaults) {
                object.layout = "";
                object.letterbox = false;
            }
            if (message.layout != null && message.hasOwnProperty("layout"))
                object.layout = message.layout;
            if (message.mean && message.mean.length) {
                object.mean = [];
                for (var j = 0; j < message.mean.length; ++j)
                    object.mean[j] = options.json && !isFinite(message.mean[j]) ? String(message.mean[j]) : message.mean[j];
            }
            if (message.std && message.std.length) {
                object.std = [];
                for (var j = 0; j < message.std.length; ++j)
                    object.std[j] = options.json && !isFinite(message.std[j]) ? String(message.std[j]) : message.std[j];
            }
            if (message.letterbox != null && message.hasOwnProperty("letterbox"))
                object.letterbox = message.letterbox;
            return object;
        };

        /**
         * Converts this Preprocessing to JSON.
         * @function toJSON
         * @memberof ai.Preprocessing
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Preprocessing.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Preprocessing
         * @function getTypeUrl
         * @memberof ai.Preprocessing
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Preprocessing.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/ai.Preprocessing";
        };

        return Preprocessing;
    })();

    ai.Ready = (function() {

        /**
         * Properties of a Ready.
         * @memberof ai
         * @interface IReady
         * @property {number|Long|null} [seq] Ready seq
         */

        /**
         * Constructs a new Ready.
         * @memberof ai
         * @classdesc Represents a Ready.
         * @implements IReady
         * @constructor
         * @param {ai.IReady=} [properties] Properties to set
         */
        function Ready(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Ready seq.
         * @member {number|Long} seq
         * @memberof ai.Ready
         * @instance
         */
        Ready.prototype.seq = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * Creates a new Ready instance using the specified properties.
         * @function create
         * @memberof ai.Ready
         * @static
         * @param {ai.IReady=} [properties] Properties to set
         * @returns {ai.Ready} Ready instance
         */
        Ready.create = function create(properties) {
            return new Ready(properties);
        };

        /**
         * Encodes the specified Ready message. Does not implicitly {@link ai.Ready.verify|verify} messages.
         * @function encode
         * @memberof ai.Ready
         * @static
         * @param {ai.IReady} message Ready message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Ready.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.seq != null && Object.hasOwnProperty.call(message, "seq"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint64(message.seq);
            return writer;
        };

        /**
         * Encodes the specified Ready message, length delimited. Does not implicitly {@link ai.Ready.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ai.Ready
         * @static
         * @param {ai.IReady} message Ready message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Ready.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a Ready message from the specified reader or buffer.
         * @function decode
         * @memberof ai.Ready
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ai.Ready} Ready
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Ready.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ai.Ready();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.seq = reader.uint64();
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
         * Decodes a Ready message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ai.Ready
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ai.Ready} Ready
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Ready.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Ready message.
         * @function verify
         * @memberof ai.Ready
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Ready.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.seq != null && message.hasOwnProperty("seq"))
                if (!$util.isInteger(message.seq) && !(message.seq && $util.isInteger(message.seq.low) && $util.isInteger(message.seq.high)))
                    return "seq: integer|Long expected";
            return null;
        };

        /**
         * Creates a Ready message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ai.Ready
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ai.Ready} Ready
         */
        Ready.fromObject = function fromObject(object) {
            if (object instanceof $root.ai.Ready)
                return object;
            var message = new $root.ai.Ready();
            if (object.seq != null)
                if ($util.Long)
                    (message.seq = $util.Long.fromValue(object.seq)).unsigned = true;
                else if (typeof object.seq === "string")
                    message.seq = parseInt(object.seq, 10);
                else if (typeof object.seq === "number")
                    message.seq = object.seq;
                else if (typeof object.seq === "object")
                    message.seq = new $util.LongBits(object.seq.low >>> 0, object.seq.high >>> 0).toNumber(true);
            return message;
        };

        /**
         * Creates a plain object from a Ready message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ai.Ready
         * @static
         * @param {ai.Ready} message Ready
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Ready.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults)
                if ($util.Long) {
                    var long = new $util.Long(0, 0, true);
                    object.seq = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.seq = options.longs === String ? "0" : 0;
            if (message.seq != null && message.hasOwnProperty("seq"))
                if (typeof message.seq === "number")
                    object.seq = options.longs === String ? String(message.seq) : message.seq;
                else
                    object.seq = options.longs === String ? $util.Long.prototype.toString.call(message.seq) : options.longs === Number ? new $util.LongBits(message.seq.low >>> 0, message.seq.high >>> 0).toNumber(true) : message.seq;
            return object;
        };

        /**
         * Converts this Ready to JSON.
         * @function toJSON
         * @memberof ai.Ready
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Ready.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Ready
         * @function getTypeUrl
         * @memberof ai.Ready
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Ready.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/ai.Ready";
        };

        return Ready;
    })();

    ai.Result = (function() {

        /**
         * Properties of a Result.
         * @memberof ai
         * @interface IResult
         * @property {number|Long|null} [seq] Result seq
         * @property {string|null} [tsIso] Result tsIso
         * @property {number|Long|null} [tsMonoNs] Result tsMonoNs
         * @property {Array.<ai.IDetection>|null} [detections] Result detections
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
            this.detections = [];
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Result seq.
         * @member {number|Long} seq
         * @memberof ai.Result
         * @instance
         */
        Result.prototype.seq = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * Result tsIso.
         * @member {string} tsIso
         * @memberof ai.Result
         * @instance
         */
        Result.prototype.tsIso = "";

        /**
         * Result tsMonoNs.
         * @member {number|Long} tsMonoNs
         * @memberof ai.Result
         * @instance
         */
        Result.prototype.tsMonoNs = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * Result detections.
         * @member {Array.<ai.IDetection>} detections
         * @memberof ai.Result
         * @instance
         */
        Result.prototype.detections = $util.emptyArray;

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
            if (message.seq != null && Object.hasOwnProperty.call(message, "seq"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint64(message.seq);
            if (message.tsIso != null && Object.hasOwnProperty.call(message, "tsIso"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.tsIso);
            if (message.tsMonoNs != null && Object.hasOwnProperty.call(message, "tsMonoNs"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint64(message.tsMonoNs);
            if (message.detections != null && message.detections.length)
                for (var i = 0; i < message.detections.length; ++i)
                    $root.ai.Detection.encode(message.detections[i], writer.uint32(/* id 4, wireType 2 =*/34).fork()).ldelim();
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
                        message.seq = reader.uint64();
                        break;
                    }
                case 2: {
                        message.tsIso = reader.string();
                        break;
                    }
                case 3: {
                        message.tsMonoNs = reader.uint64();
                        break;
                    }
                case 4: {
                        if (!(message.detections && message.detections.length))
                            message.detections = [];
                        message.detections.push($root.ai.Detection.decode(reader, reader.uint32()));
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
            if (message.seq != null && message.hasOwnProperty("seq"))
                if (!$util.isInteger(message.seq) && !(message.seq && $util.isInteger(message.seq.low) && $util.isInteger(message.seq.high)))
                    return "seq: integer|Long expected";
            if (message.tsIso != null && message.hasOwnProperty("tsIso"))
                if (!$util.isString(message.tsIso))
                    return "tsIso: string expected";
            if (message.tsMonoNs != null && message.hasOwnProperty("tsMonoNs"))
                if (!$util.isInteger(message.tsMonoNs) && !(message.tsMonoNs && $util.isInteger(message.tsMonoNs.low) && $util.isInteger(message.tsMonoNs.high)))
                    return "tsMonoNs: integer|Long expected";
            if (message.detections != null && message.hasOwnProperty("detections")) {
                if (!Array.isArray(message.detections))
                    return "detections: array expected";
                for (var i = 0; i < message.detections.length; ++i) {
                    var error = $root.ai.Detection.verify(message.detections[i]);
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
            if (object.seq != null)
                if ($util.Long)
                    (message.seq = $util.Long.fromValue(object.seq)).unsigned = true;
                else if (typeof object.seq === "string")
                    message.seq = parseInt(object.seq, 10);
                else if (typeof object.seq === "number")
                    message.seq = object.seq;
                else if (typeof object.seq === "object")
                    message.seq = new $util.LongBits(object.seq.low >>> 0, object.seq.high >>> 0).toNumber(true);
            if (object.tsIso != null)
                message.tsIso = String(object.tsIso);
            if (object.tsMonoNs != null)
                if ($util.Long)
                    (message.tsMonoNs = $util.Long.fromValue(object.tsMonoNs)).unsigned = true;
                else if (typeof object.tsMonoNs === "string")
                    message.tsMonoNs = parseInt(object.tsMonoNs, 10);
                else if (typeof object.tsMonoNs === "number")
                    message.tsMonoNs = object.tsMonoNs;
                else if (typeof object.tsMonoNs === "object")
                    message.tsMonoNs = new $util.LongBits(object.tsMonoNs.low >>> 0, object.tsMonoNs.high >>> 0).toNumber(true);
            if (object.detections) {
                if (!Array.isArray(object.detections))
                    throw TypeError(".ai.Result.detections: array expected");
                message.detections = [];
                for (var i = 0; i < object.detections.length; ++i) {
                    if (typeof object.detections[i] !== "object")
                        throw TypeError(".ai.Result.detections: object expected");
                    message.detections[i] = $root.ai.Detection.fromObject(object.detections[i]);
                }
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
            if (options.arrays || options.defaults)
                object.detections = [];
            if (options.defaults) {
                if ($util.Long) {
                    var long = new $util.Long(0, 0, true);
                    object.seq = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.seq = options.longs === String ? "0" : 0;
                object.tsIso = "";
                if ($util.Long) {
                    var long = new $util.Long(0, 0, true);
                    object.tsMonoNs = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.tsMonoNs = options.longs === String ? "0" : 0;
            }
            if (message.seq != null && message.hasOwnProperty("seq"))
                if (typeof message.seq === "number")
                    object.seq = options.longs === String ? String(message.seq) : message.seq;
                else
                    object.seq = options.longs === String ? $util.Long.prototype.toString.call(message.seq) : options.longs === Number ? new $util.LongBits(message.seq.low >>> 0, message.seq.high >>> 0).toNumber(true) : message.seq;
            if (message.tsIso != null && message.hasOwnProperty("tsIso"))
                object.tsIso = message.tsIso;
            if (message.tsMonoNs != null && message.hasOwnProperty("tsMonoNs"))
                if (typeof message.tsMonoNs === "number")
                    object.tsMonoNs = options.longs === String ? String(message.tsMonoNs) : message.tsMonoNs;
                else
                    object.tsMonoNs = options.longs === String ? $util.Long.prototype.toString.call(message.tsMonoNs) : options.longs === Number ? new $util.LongBits(message.tsMonoNs.low >>> 0, message.tsMonoNs.high >>> 0).toNumber(true) : message.tsMonoNs;
            if (message.detections && message.detections.length) {
                object.detections = [];
                for (var j = 0; j < message.detections.length; ++j)
                    object.detections[j] = $root.ai.Detection.toObject(message.detections[j], options);
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

    ai.Detection = (function() {

        /**
         * Properties of a Detection.
         * @memberof ai
         * @interface IDetection
         * @property {string|null} [cls] Detection cls
         * @property {number|null} [conf] Detection conf
         * @property {ai.IBoundingBox|null} [bbox] Detection bbox
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
         * Detection cls.
         * @member {string} cls
         * @memberof ai.Detection
         * @instance
         */
        Detection.prototype.cls = "";

        /**
         * Detection conf.
         * @member {number} conf
         * @memberof ai.Detection
         * @instance
         */
        Detection.prototype.conf = 0;

        /**
         * Detection bbox.
         * @member {ai.IBoundingBox|null|undefined} bbox
         * @memberof ai.Detection
         * @instance
         */
        Detection.prototype.bbox = null;

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
            if (message.cls != null && Object.hasOwnProperty.call(message, "cls"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.cls);
            if (message.conf != null && Object.hasOwnProperty.call(message, "conf"))
                writer.uint32(/* id 2, wireType 5 =*/21).float(message.conf);
            if (message.bbox != null && Object.hasOwnProperty.call(message, "bbox"))
                $root.ai.BoundingBox.encode(message.bbox, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
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
                        message.cls = reader.string();
                        break;
                    }
                case 2: {
                        message.conf = reader.float();
                        break;
                    }
                case 3: {
                        message.bbox = $root.ai.BoundingBox.decode(reader, reader.uint32());
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
            if (message.cls != null && message.hasOwnProperty("cls"))
                if (!$util.isString(message.cls))
                    return "cls: string expected";
            if (message.conf != null && message.hasOwnProperty("conf"))
                if (typeof message.conf !== "number")
                    return "conf: number expected";
            if (message.bbox != null && message.hasOwnProperty("bbox")) {
                var error = $root.ai.BoundingBox.verify(message.bbox);
                if (error)
                    return "bbox." + error;
            }
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
            if (object.cls != null)
                message.cls = String(object.cls);
            if (object.conf != null)
                message.conf = Number(object.conf);
            if (object.bbox != null) {
                if (typeof object.bbox !== "object")
                    throw TypeError(".ai.Detection.bbox: object expected");
                message.bbox = $root.ai.BoundingBox.fromObject(object.bbox);
            }
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
                object.cls = "";
                object.conf = 0;
                object.bbox = null;
                object.trackId = "";
            }
            if (message.cls != null && message.hasOwnProperty("cls"))
                object.cls = message.cls;
            if (message.conf != null && message.hasOwnProperty("conf"))
                object.conf = options.json && !isFinite(message.conf) ? String(message.conf) : message.conf;
            if (message.bbox != null && message.hasOwnProperty("bbox"))
                object.bbox = $root.ai.BoundingBox.toObject(message.bbox, options);
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

    ai.BoundingBox = (function() {

        /**
         * Properties of a BoundingBox.
         * @memberof ai
         * @interface IBoundingBox
         * @property {number|null} [x] BoundingBox x
         * @property {number|null} [y] BoundingBox y
         * @property {number|null} [w] BoundingBox w
         * @property {number|null} [h] BoundingBox h
         */

        /**
         * Constructs a new BoundingBox.
         * @memberof ai
         * @classdesc Represents a BoundingBox.
         * @implements IBoundingBox
         * @constructor
         * @param {ai.IBoundingBox=} [properties] Properties to set
         */
        function BoundingBox(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * BoundingBox x.
         * @member {number} x
         * @memberof ai.BoundingBox
         * @instance
         */
        BoundingBox.prototype.x = 0;

        /**
         * BoundingBox y.
         * @member {number} y
         * @memberof ai.BoundingBox
         * @instance
         */
        BoundingBox.prototype.y = 0;

        /**
         * BoundingBox w.
         * @member {number} w
         * @memberof ai.BoundingBox
         * @instance
         */
        BoundingBox.prototype.w = 0;

        /**
         * BoundingBox h.
         * @member {number} h
         * @memberof ai.BoundingBox
         * @instance
         */
        BoundingBox.prototype.h = 0;

        /**
         * Creates a new BoundingBox instance using the specified properties.
         * @function create
         * @memberof ai.BoundingBox
         * @static
         * @param {ai.IBoundingBox=} [properties] Properties to set
         * @returns {ai.BoundingBox} BoundingBox instance
         */
        BoundingBox.create = function create(properties) {
            return new BoundingBox(properties);
        };

        /**
         * Encodes the specified BoundingBox message. Does not implicitly {@link ai.BoundingBox.verify|verify} messages.
         * @function encode
         * @memberof ai.BoundingBox
         * @static
         * @param {ai.IBoundingBox} message BoundingBox message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        BoundingBox.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.x != null && Object.hasOwnProperty.call(message, "x"))
                writer.uint32(/* id 1, wireType 5 =*/13).float(message.x);
            if (message.y != null && Object.hasOwnProperty.call(message, "y"))
                writer.uint32(/* id 2, wireType 5 =*/21).float(message.y);
            if (message.w != null && Object.hasOwnProperty.call(message, "w"))
                writer.uint32(/* id 3, wireType 5 =*/29).float(message.w);
            if (message.h != null && Object.hasOwnProperty.call(message, "h"))
                writer.uint32(/* id 4, wireType 5 =*/37).float(message.h);
            return writer;
        };

        /**
         * Encodes the specified BoundingBox message, length delimited. Does not implicitly {@link ai.BoundingBox.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ai.BoundingBox
         * @static
         * @param {ai.IBoundingBox} message BoundingBox message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        BoundingBox.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a BoundingBox message from the specified reader or buffer.
         * @function decode
         * @memberof ai.BoundingBox
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ai.BoundingBox} BoundingBox
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        BoundingBox.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ai.BoundingBox();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.x = reader.float();
                        break;
                    }
                case 2: {
                        message.y = reader.float();
                        break;
                    }
                case 3: {
                        message.w = reader.float();
                        break;
                    }
                case 4: {
                        message.h = reader.float();
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
         * Decodes a BoundingBox message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ai.BoundingBox
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ai.BoundingBox} BoundingBox
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        BoundingBox.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a BoundingBox message.
         * @function verify
         * @memberof ai.BoundingBox
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        BoundingBox.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.x != null && message.hasOwnProperty("x"))
                if (typeof message.x !== "number")
                    return "x: number expected";
            if (message.y != null && message.hasOwnProperty("y"))
                if (typeof message.y !== "number")
                    return "y: number expected";
            if (message.w != null && message.hasOwnProperty("w"))
                if (typeof message.w !== "number")
                    return "w: number expected";
            if (message.h != null && message.hasOwnProperty("h"))
                if (typeof message.h !== "number")
                    return "h: number expected";
            return null;
        };

        /**
         * Creates a BoundingBox message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ai.BoundingBox
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ai.BoundingBox} BoundingBox
         */
        BoundingBox.fromObject = function fromObject(object) {
            if (object instanceof $root.ai.BoundingBox)
                return object;
            var message = new $root.ai.BoundingBox();
            if (object.x != null)
                message.x = Number(object.x);
            if (object.y != null)
                message.y = Number(object.y);
            if (object.w != null)
                message.w = Number(object.w);
            if (object.h != null)
                message.h = Number(object.h);
            return message;
        };

        /**
         * Creates a plain object from a BoundingBox message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ai.BoundingBox
         * @static
         * @param {ai.BoundingBox} message BoundingBox
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        BoundingBox.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults) {
                object.x = 0;
                object.y = 0;
                object.w = 0;
                object.h = 0;
            }
            if (message.x != null && message.hasOwnProperty("x"))
                object.x = options.json && !isFinite(message.x) ? String(message.x) : message.x;
            if (message.y != null && message.hasOwnProperty("y"))
                object.y = options.json && !isFinite(message.y) ? String(message.y) : message.y;
            if (message.w != null && message.hasOwnProperty("w"))
                object.w = options.json && !isFinite(message.w) ? String(message.w) : message.w;
            if (message.h != null && message.hasOwnProperty("h"))
                object.h = options.json && !isFinite(message.h) ? String(message.h) : message.h;
            return object;
        };

        /**
         * Converts this BoundingBox to JSON.
         * @function toJSON
         * @memberof ai.BoundingBox
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        BoundingBox.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for BoundingBox
         * @function getTypeUrl
         * @memberof ai.BoundingBox
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        BoundingBox.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/ai.BoundingBox";
        };

        return BoundingBox;
    })();

    ai.Error = (function() {

        /**
         * Properties of an Error.
         * @memberof ai
         * @interface IError
         * @property {number|null} [code] Error code
         * @property {string|null} [message] Error message
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
         * @member {number} code
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
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.code);
            if (message.message != null && Object.hasOwnProperty.call(message, "message"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.message);
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
                        message.code = reader.uint32();
                        break;
                    }
                case 2: {
                        message.message = reader.string();
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
                if (!$util.isInteger(message.code))
                    return "code: integer expected";
            if (message.message != null && message.hasOwnProperty("message"))
                if (!$util.isString(message.message))
                    return "message: string expected";
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
            if (object.code != null)
                message.code = object.code >>> 0;
            if (object.message != null)
                message.message = String(object.message);
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
                object.code = 0;
                object.message = "";
            }
            if (message.code != null && message.hasOwnProperty("code"))
                object.code = message.code;
            if (message.message != null && message.hasOwnProperty("message"))
                object.message = message.message;
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
         * @property {number|Long|null} [tsMonoNs] Heartbeat tsMonoNs
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
         * Heartbeat tsMonoNs.
         * @member {number|Long} tsMonoNs
         * @memberof ai.Heartbeat
         * @instance
         */
        Heartbeat.prototype.tsMonoNs = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

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
            if (message.tsMonoNs != null && Object.hasOwnProperty.call(message, "tsMonoNs"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint64(message.tsMonoNs);
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
                        message.tsMonoNs = reader.uint64();
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
            if (message.tsMonoNs != null && message.hasOwnProperty("tsMonoNs"))
                if (!$util.isInteger(message.tsMonoNs) && !(message.tsMonoNs && $util.isInteger(message.tsMonoNs.low) && $util.isInteger(message.tsMonoNs.high)))
                    return "tsMonoNs: integer|Long expected";
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
            if (object.tsMonoNs != null)
                if ($util.Long)
                    (message.tsMonoNs = $util.Long.fromValue(object.tsMonoNs)).unsigned = true;
                else if (typeof object.tsMonoNs === "string")
                    message.tsMonoNs = parseInt(object.tsMonoNs, 10);
                else if (typeof object.tsMonoNs === "number")
                    message.tsMonoNs = object.tsMonoNs;
                else if (typeof object.tsMonoNs === "object")
                    message.tsMonoNs = new $util.LongBits(object.tsMonoNs.low >>> 0, object.tsMonoNs.high >>> 0).toNumber(true);
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
            if (options.defaults)
                if ($util.Long) {
                    var long = new $util.Long(0, 0, true);
                    object.tsMonoNs = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.tsMonoNs = options.longs === String ? "0" : 0;
            if (message.tsMonoNs != null && message.hasOwnProperty("tsMonoNs"))
                if (typeof message.tsMonoNs === "number")
                    object.tsMonoNs = options.longs === String ? String(message.tsMonoNs) : message.tsMonoNs;
                else
                    object.tsMonoNs = options.longs === String ? $util.Long.prototype.toString.call(message.tsMonoNs) : options.longs === Number ? new $util.LongBits(message.tsMonoNs.low >>> 0, message.tsMonoNs.high >>> 0).toNumber(true) : message.tsMonoNs;
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
