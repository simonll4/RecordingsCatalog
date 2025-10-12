"""
AI Worker v1 - Protocol v1 with NV12/I420/JPEG support

Features:
- Protocol version validation (must be 1)
- msg_type ↔ oneof validation
- Sequence validation (Init must be first)
- NV12/I420/JPEG frame decoding
- Window-based backpressure
- Error codes per v1 spec
"""

import asyncio
import logging
import os
import struct
import time
from dataclasses import dataclass
from enum import Enum
from typing import Dict, Optional, Set

import ai_pb2 as pb
import numpy as np
import onnxruntime as ort


VISUALIZATION_ENABLED = False
# Visualización (opcional, solo si CV2 está disponible)
try:
    import cv2
    VISUALIZATION_ENABLED = True
except ImportError:
    VISUALIZATION_ENABLED = False
    print("Warning: opencv-python not installed, visualization disabled")

# Configuración
BIND_HOST = os.getenv("BIND_HOST", "0.0.0.0")
BIND_PORT = int(os.getenv("BIND_PORT", "7001"))
IDLE_TIMEOUT_SEC = int(os.getenv("IDLE_TIMEOUT_SEC", "60"))

# Visualización
ENABLE_VISUALIZATION = os.getenv("ENABLE_VISUALIZATION", "true").lower() == "true"
VISUALIZATION_WINDOW_NAME = "AI Worker - Detections"

if ENABLE_VISUALIZATION and VISUALIZATION_ENABLED:
    print("✓ Visualization ENABLED (cv2 available)")
elif ENABLE_VISUALIZATION and not VISUALIZATION_ENABLED:
    print("✗ Visualization requested but cv2 not available")
else:
    print("✗ Visualization DISABLED")

# Bootstrap (opcional)
BOOTSTRAP_MODEL_PATH = os.getenv("BOOTSTRAP_MODEL_PATH")
BOOTSTRAP_WIDTH = int(os.getenv("BOOTSTRAP_WIDTH", "640")) if os.getenv("BOOTSTRAP_WIDTH") else None
BOOTSTRAP_HEIGHT = int(os.getenv("BOOTSTRAP_HEIGHT", "640")) if os.getenv("BOOTSTRAP_HEIGHT") else None
BOOTSTRAP_CONF = float(os.getenv("BOOTSTRAP_CONF", "0.35")) if os.getenv("BOOTSTRAP_CONF") else None

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("worker-ai")


class WorkerState(Enum):
    IDLE = "IDLE"
    LOADING = "LOADING"
    READY = "READY"


@dataclass
class ModelConfig:
    """Model configuration"""
    model_path: str
    width: int
    height: int
    conf_threshold: float

    def __hash__(self):
        return hash((self.model_path, self.width, self.height, self.conf_threshold))

    def __eq__(self, other):
        if not isinstance(other, ModelConfig):
            return False
        return (
            self.model_path == other.model_path
            and self.width == other.width
            and self.height == other.height
            and self.conf_threshold == other.conf_threshold
        )


class ModelManager:
    """Gestor de modelo ONNX"""

    def __init__(self):
        self.session: Optional[ort.InferenceSession] = None
        self.config: Optional[ModelConfig] = None
        self.model_id: Optional[str] = None
        self.class_names = []

    def load(self, config: ModelConfig):
        """Carga modelo ONNX"""
        logger.info(f"Loading model: {config.model_path}")

        # Providers (GPU si está disponible)
        providers = ["CPUExecutionProvider"]
        if "CUDAExecutionProvider" in ort.get_available_providers():
            providers.insert(0, "CUDAExecutionProvider")

        self.session = ort.InferenceSession(config.model_path, providers=providers)
        self.config = config

        # ID del modelo (hash simple)
        self.model_id = f"{os.path.basename(config.model_path)}_{config.width}x{config.height}"

        # Nombres de clases (COCO por defecto)
        self.class_names = self._get_class_names()

        logger.info(
            f"Model loaded: {self.model_id}, providers={self.session.get_providers()}, classes={len(self.class_names)}"
        )

    def unload(self):
        """Descarga modelo (libera memoria)"""
        if self.session:
            logger.info("Unloading model")
            self.session = None
            self.config = None
            self.model_id = None
            self.class_names = []

    def infer(self, frame_rgb: np.ndarray) -> tuple:
        """Inference on RGB frame, returns (detections, latency_dict)"""
        if not self.session or not self.config:
            raise RuntimeError("Model not loaded")

        # Preprocessing
        t0 = time.perf_counter()
        input_tensor = self._preprocess(frame_rgb)
        t1 = time.perf_counter()

        # Inference
        input_name = self.session.get_inputs()[0].name
        outputs = self.session.run(None, {input_name: input_tensor})
        t2 = time.perf_counter()

        # Postprocessing
        detections = self._postprocess(outputs[0], frame_rgb.shape[:2])
        t3 = time.perf_counter()

        latency = {
            "pre_ms": (t1 - t0) * 1000,
            "infer_ms": (t2 - t1) * 1000,
            "post_ms": (t3 - t2) * 1000,
            "total_ms": (t3 - t0) * 1000,
        }

        return detections, latency

    def _preprocess(self, frame_rgb: np.ndarray) -> np.ndarray:
        """Preprocesar frame para YOLO"""
        # Resize (letterbox)
        img = self._letterbox(frame_rgb, (self.config.width, self.config.height))

        # Normalizar
        img = img.astype(np.float32) / 255.0

        # HWC → CHW
        img = np.transpose(img, (2, 0, 1))

        # Add batch dimension
        img = np.expand_dims(img, axis=0)

        return img

    def _letterbox(self, img: np.ndarray, new_shape: tuple) -> np.ndarray:
        """Resize con letterbox (mantiene aspect ratio)"""
        shape = img.shape[:2]  # current shape [height, width]
        ratio = min(new_shape[0] / shape[0], new_shape[1] / shape[1])

        new_unpad = (int(round(shape[1] * ratio)), int(round(shape[0] * ratio)))
        dw, dh = new_shape[1] - new_unpad[0], new_shape[0] - new_unpad[1]
        dw /= 2
        dh /= 2

        if shape[::-1] != new_unpad:
            img = np.resize(img, (new_unpad[1], new_unpad[0], 3))

        top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
        left, right = int(round(dw - 0.1)), int(round(dw + 0.1))
        img = np.pad(img, ((top, bottom), (left, right), (0, 0)), mode="constant", constant_values=114)

        return img

    def _postprocess(self, output: np.ndarray, img_shape: tuple) -> np.ndarray:
        """Postprocesar output de YOLO (NMS)"""
        # YOLOv8 output: [1, 84, 8400] → transpose to [8400, 84]
        predictions = output[0].transpose()  # [8400, 84]

        # YOLOv8 format: [x, y, w, h, class_0_prob, class_1_prob, ..., class_79_prob]
        # Primero extraemos bbox coords
        boxes = predictions[:, :4]
        
        # Luego las probabilidades de clase (columnas 4:84 = 80 clases)
        class_probs = predictions[:, 4:]
        
        # Obtener la clase con mayor probabilidad y su confianza
        cls = np.argmax(class_probs, axis=1)
        conf = np.max(class_probs, axis=1)

        # Filtrar por confianza
        conf_mask = conf >= self.config.conf_threshold
        boxes = boxes[conf_mask]
        conf = conf[conf_mask]
        cls = cls[conf_mask]

        if len(boxes) == 0:
            return np.array([])

        # Convertir (cx, cy, w, h) → (x1, y1, x2, y2)
        boxes_xyxy = boxes.copy()
        boxes_xyxy[:, 0] = boxes[:, 0] - boxes[:, 2] / 2  # x1
        boxes_xyxy[:, 1] = boxes[:, 1] - boxes[:, 3] / 2  # y1
        boxes_xyxy[:, 2] = boxes[:, 0] + boxes[:, 2] / 2  # x2
        boxes_xyxy[:, 3] = boxes[:, 1] + boxes[:, 3] / 2  # y2

        # Escalar a imagen original
        boxes_xyxy[:, [0, 2]] *= img_shape[1] / self.config.width
        boxes_xyxy[:, [1, 3]] *= img_shape[0] / self.config.height

        # NMS simple (IoU threshold 0.45)
        keep = self._nms(boxes_xyxy, conf, 0.45)

        # Concatenar [x1, y1, x2, y2, conf, cls]
        detections = np.column_stack([boxes_xyxy[keep], conf[keep], cls[keep]])

        return detections

    def _nms(self, boxes: np.ndarray, scores: np.ndarray, iou_threshold: float) -> np.ndarray:
        """Non-Maximum Suppression"""
        x1 = boxes[:, 0]
        y1 = boxes[:, 1]
        x2 = boxes[:, 2]
        y2 = boxes[:, 3]

        areas = (x2 - x1) * (y2 - y1)
        order = scores.argsort()[::-1]

        keep = []
        while order.size > 0:
            i = order[0]
            keep.append(i)

            xx1 = np.maximum(x1[i], x1[order[1:]])
            yy1 = np.maximum(y1[i], y1[order[1:]])
            xx2 = np.minimum(x2[i], x2[order[1:]])
            yy2 = np.minimum(y2[i], y2[order[1:]])

            w = np.maximum(0.0, xx2 - xx1)
            h = np.maximum(0.0, yy2 - yy1)
            inter = w * h

            iou = inter / (areas[i] + areas[order[1:]] - inter)

            inds = np.where(iou <= iou_threshold)[0]
            order = order[inds + 1]

        return np.array(keep)

    def _get_class_names(self):
        """Nombres de clases COCO (80 clases)"""
        return [
            "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light",
            "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow",
            "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
            "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard",
            "tennis racket", "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
            "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch",
            "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard",
            "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase",
            "scissors", "teddy bear", "hair drier", "toothbrush"
        ]


def nv12_to_rgb(data: bytes, width: int, height: int) -> np.ndarray:
    """Convert NV12 to RGB"""
    try:
        import cv2
        y_size = width * height
        y_plane = np.frombuffer(data[:y_size], dtype=np.uint8).reshape((height, width))
        uv_plane = np.frombuffer(data[y_size:], dtype=np.uint8).reshape((height // 2, width))
        nv12 = np.zeros((height + height // 2, width), dtype=np.uint8)
        nv12[:height, :] = y_plane
        nv12[height:, :] = uv_plane
        return cv2.cvtColor(nv12, cv2.COLOR_YUV2RGB_NV12)
    except ImportError:
        # Manual fallback
        y_size = width * height
        y = np.frombuffer(data[:y_size], dtype=np.uint8).reshape((height, width)).astype(np.float32)
        uv = np.frombuffer(data[y_size:], dtype=np.uint8).reshape((height // 2, width))
        u = np.repeat(np.repeat(uv[:, 0::2], 2, axis=0), 2, axis=1).astype(np.float32) - 128
        v = np.repeat(np.repeat(uv[:, 1::2], 2, axis=0), 2, axis=1).astype(np.float32) - 128
        r = np.clip(y + 1.402 * v, 0, 255)
        g = np.clip(y - 0.344 * u - 0.714 * v, 0, 255)
        b = np.clip(y + 1.772 * u, 0, 255)
        return np.stack([r, g, b], axis=2).astype(np.uint8)


def i420_to_rgb(data: bytes, width: int, height: int) -> np.ndarray:
    """Convert I420 to RGB"""
    try:
        import cv2
        y_size = width * height
        u_size = width * height // 4
        y = np.frombuffer(data[:y_size], dtype=np.uint8).reshape((height, width))
        u = np.frombuffer(data[y_size:y_size + u_size], dtype=np.uint8).reshape((height // 2, width // 2))
        v = np.frombuffer(data[y_size + u_size:], dtype=np.uint8).reshape((height // 2, width // 2))
        i420 = np.zeros((height + height // 2, width), dtype=np.uint8)
        i420[:height, :] = y
        i420[height:height + height // 4, :width // 2] = u.reshape(-1, width // 2)
        i420[height + height // 4:, :width // 2] = v.reshape(-1, width // 2)
        return cv2.cvtColor(i420, cv2.COLOR_YUV2RGB_I420)
    except ImportError:
        # Manual fallback
        y_size = width * height
        u_size = width * height // 4
        y = np.frombuffer(data[:y_size], dtype=np.uint8).reshape((height, width)).astype(np.float32)
        u = np.frombuffer(data[y_size:y_size + u_size], dtype=np.uint8).reshape((height // 2, width // 2))
        v = np.frombuffer(data[y_size + u_size:], dtype=np.uint8).reshape((height // 2, width // 2))
        u = np.repeat(np.repeat(u, 2, axis=0), 2, axis=1).astype(np.float32) - 128
        v = np.repeat(np.repeat(v, 2, axis=0), 2, axis=1).astype(np.float32) - 128
        r = np.clip(y + 1.402 * v, 0, 255)
        g = np.clip(y - 0.344 * u - 0.714 * v, 0, 255)
        b = np.clip(y + 1.772 * u, 0, 255)
        return np.stack([r, g, b], axis=2).astype(np.uint8)


def jpeg_to_rgb(data: bytes) -> np.ndarray:
    """Decode JPEG to RGB"""
    import cv2
    nparr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


def visualize_detections(frame_rgb, result, class_names=None):
    """
    Muestra el frame con las detecciones dibujadas usando OpenCV.
    
    Args:
        frame_rgb: Frame en formato RGB (H, W, 3)
        result: Resultado de inferencia con detecciones
        class_names: (Opcional) Lista de nombres de clases disponibles
    """
    if not (VISUALIZATION_ENABLED and ENABLE_VISUALIZATION):
        return
    
    if result.WhichOneof("out") != "detections":
        detections = []
    else:
        detections = result.detections.items

    logger.debug(f"Visualizing frame_id={result.frame_id} with {len(detections)} detections")

    # Crear ventana una sola vez
    if not hasattr(visualize_detections, "_window_initialized"):
        cv2.namedWindow(VISUALIZATION_WINDOW_NAME, cv2.WINDOW_NORMAL)
        visualize_detections._window_initialized = True

    # Convertir RGB a BGR para OpenCV
    frame_bgr = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
    h, w = frame_bgr.shape[:2]
    
    # Dibujar cada detección
    for det in detections:
        x1 = max(0, min(w - 1, int(det.bbox.x1)))
        y1 = max(0, min(h - 1, int(det.bbox.y1)))
        x2 = max(0, min(w - 1, int(det.bbox.x2)))
        y2 = max(0, min(h - 1, int(det.bbox.y2)))

        if x2 <= x1 or y2 <= y1:
            continue
        
        # Color verde para todas las detecciones
        color = (0, 255, 0)
        
        # Dibujar rectángulo
        cv2.rectangle(frame_bgr, (x1, y1), (x2, y2), color, 2)
        
        # Texto con clase y confianza
        label_cls = det.cls if det.cls else "unknown"
        label = f"{label_cls}: {det.conf:.2f}"
        
        # Fondo para el texto
        (text_w, text_h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        text_y = max(y1, text_h + 4)
        cv2.rectangle(frame_bgr, (x1, text_y - text_h - 4), (x1 + text_w, text_y), color, -1)
        
        # Texto blanco
        cv2.putText(
            frame_bgr,
            label,
            (x1, text_y - 2),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 0, 0),
            1,
            cv2.LINE_AA,
        )
    
    # Info del frame
    info_text = f"Frame: {result.frame_id} | Detections: {len(detections)}"
    cv2.putText(
        frame_bgr,
        info_text,
        (10, 25),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        (0, 255, 0),
        2,
        cv2.LINE_AA,
    )
    
    # Mostrar
    cv2.imshow(VISUALIZATION_WINDOW_NAME, frame_bgr)
    cv2.waitKey(1)  # 1ms delay para actualizar la ventana


class ConnectionHandler:
    """v1 Protocol connection handler"""

    def __init__(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
        model_manager: ModelManager,
        on_disconnect: callable,
    ):
        self.reader = reader
        self.writer = writer
        self.model_manager = model_manager
        self.on_disconnect = on_disconnect

        self.peer = writer.get_extra_info("peername")
        self.stream_id = None
        self.initialized = False
        self.window_size = 4
        self.inflight = 0
        self.tx_count = 0
        self.rx_count = 0
        self.last_frame_id = 0
        
        # Auto-tuning state
        self.recent_latencies = []  # Last N latencies for averaging
        self.max_recent_latencies = 10
        self.high_latency_threshold_ms = 100.0  # Increase window if latency > this
        self.low_latency_threshold_ms = 30.0   # Decrease window if latency < this
        self.min_window_size = 2
        self.max_window_size = 16
        
        # Metrics
        self.window_size_set_events_total = 0
        self.backpressure_timeouts_total = 0

    async def handle(self):
        """Main connection loop with v1 protocol validation"""
        logger.info(f"Client connected: {self.peer}")

        try:
            while True:
                length_bytes = await self.reader.readexactly(4)
                length = struct.unpack("<I", length_bytes)[0]

                # Validate length
                if length == 0 or length > 50 * 1024 * 1024:
                    await self.send_error(pb.FRAME_TOO_LARGE, f"Invalid length: {length}")
                    break

                msg_bytes = await self.reader.readexactly(length)
                self.rx_count += 1

                envelope = pb.Envelope()
                envelope.ParseFromString(msg_bytes)

                await self.handle_envelope(envelope)

        except asyncio.IncompleteReadError:
            logger.info(f"Client disconnected: {self.peer}")
        except Exception as e:
            logger.error(f"Error handling connection {self.peer}: {e}", exc_info=True)
        finally:
            self.writer.close()
            await self.writer.wait_closed()
            await self.on_disconnect()

    async def handle_envelope(self, envelope: pb.Envelope):
        """Process envelope with v1 protocol validation"""
        # Validate protocol version
        if envelope.protocol_version != 1:
            await self.send_error(pb.VERSION_UNSUPPORTED, f"Protocol version {envelope.protocol_version} not supported")
            return

        # Validate msg_type matches oneof
        expected_type = self.get_expected_msg_type(envelope)
        if expected_type != envelope.msg_type:
            await self.send_error(pb.BAD_MESSAGE, f"msg_type {envelope.msg_type} does not match oneof")
            return

        # Store stream_id
        if not self.stream_id:
            self.stream_id = envelope.stream_id

        # Validate sequence: first message must be Init
        if not self.initialized and envelope.WhichOneof("msg") != "req":
            await self.send_error(pb.BAD_SEQUENCE, "First message must be Request.Init")
            return

        # Route message
        if envelope.HasField("req"):
            await self.handle_request(envelope.req)
        elif envelope.HasField("hb"):
            await self.handle_heartbeat(envelope.hb)

    def get_expected_msg_type(self, envelope: pb.Envelope):
        """Get expected msg_type from oneof"""
        if envelope.HasField("req"):
            if envelope.req.HasField("init"):
                return pb.MT_INIT
            elif envelope.req.HasField("frame"):
                return pb.MT_FRAME
            elif envelope.req.HasField("end"):
                return pb.MT_END
        elif envelope.HasField("res"):
            if envelope.res.HasField("init_ok"):
                return pb.MT_INIT_OK
            elif envelope.res.HasField("window_update"):
                return pb.MT_WINDOW_UPDATE
            elif envelope.res.HasField("result"):
                return pb.MT_RESULT
            elif envelope.res.HasField("error"):
                return pb.MT_ERROR
        elif envelope.HasField("hb"):
            return pb.MT_HEARTBEAT
        return pb.MT_UNKNOWN

    async def handle_request(self, req: pb.Request):
        """Process Request"""
        if req.HasField("init"):
            await self.handle_init(req.init)
        elif req.HasField("frame"):
            await self.handle_frame(req.frame)
        elif req.HasField("end"):
            await self.handle_end()

    async def handle_init(self, init: pb.Init):
        """Process Init"""
        logger.info(f"Received Init: model={init.model}")

        # Extract config from caps
        config = ModelConfig(
            model_path=init.model,
            width=init.caps.max_width,
            height=init.caps.max_height,
            conf_threshold=0.35,
        )

        # Hot-reload if config changed
        if self.model_manager.config != config:
            logger.info("Config changed, reloading model")
            self.model_manager.load(config)

        # Build InitOk
        init_ok = pb.InitOk()
        init_ok.max_frame_bytes = config.width * config.height * 3 * 2

        # Chosen config
        init_ok.chosen.pixel_format = pb.PF_NV12
        init_ok.chosen.codec = pb.CODEC_NONE
        init_ok.chosen.width = config.width
        init_ok.chosen.height = config.height
        init_ok.chosen.fps_target = 10.0
        init_ok.chosen.policy = pb.LATEST_WINS
        init_ok.chosen.initial_credits = self.window_size
        init_ok.chosen.color_space = "BT.709"
        init_ok.chosen.color_range = "full"

        await self.send_response(init_ok=init_ok)
        self.initialized = True
        logger.info("Sent InitOk")

    async def handle_frame(self, frame: pb.Frame):
        """Process Frame with v1 protocol (NV12/I420/JPEG support)"""
        if not self.initialized:
            await self.send_error(pb.BAD_SEQUENCE, "Init required before Frame")
            return
        
        # Backpressure: check window
        if self.inflight >= self.window_size:
            logger.warning(f"Backpressure timeout: inflight={self.inflight}, window={self.window_size}")
            self.backpressure_timeouts_total += 1
            logger.debug(f"Metrics: backpressure_timeouts_total={self.backpressure_timeouts_total}")
            await self.send_error(pb.BACKPRESSURE_TIMEOUT, "Window full")
            return
        
        self.inflight += 1
        logger.debug(f"Metrics: queue_depth={self.inflight}")

        self.last_frame_id = frame.frame_id
        logger.debug(f"Processing frame id={frame.frame_id}, size={len(frame.data)}")

        # Validate planes if RAW
        if frame.codec == pb.CODEC_NONE:
            total_plane_size = sum(p.size for p in frame.planes)
            if total_plane_size != len(frame.data):
                await self.send_error(pb.INVALID_FRAME, f"Plane size mismatch: {total_plane_size} != {len(frame.data)}")
                return

        # Decode to RGB
        try:
            if frame.codec == pb.CODEC_NONE:
                if frame.pixel_format == pb.PF_NV12:
                    frame_rgb = nv12_to_rgb(frame.data, frame.width, frame.height)
                elif frame.pixel_format == pb.PF_I420:
                    frame_rgb = i420_to_rgb(frame.data, frame.width, frame.height)
                elif frame.pixel_format == pb.PF_RGB8:
                    frame_rgb = np.frombuffer(frame.data, dtype=np.uint8).reshape((frame.height, frame.width, 3))
                else:
                    await self.send_error(pb.UNSUPPORTED_FORMAT, f"Unsupported pixel format: {frame.pixel_format}")
                    return
            elif frame.codec == pb.CODEC_JPEG:
                frame_rgb = jpeg_to_rgb(frame.data)
            else:
                await self.send_error(pb.UNSUPPORTED_FORMAT, f"Unsupported codec: {frame.codec}")
                return
        except Exception as e:
            await self.send_error(pb.INVALID_FRAME, f"Frame decode failed: {e}")
            return

        # Inference
        detections, latency = self.model_manager.infer(frame_rgb)

        # Build Result
        result = pb.Result()
        result.frame_id = frame.frame_id
        result.frame_ref.ts_mono_ns = frame.ts_mono_ns
        result.frame_ref.ts_utc_ns = frame.ts_utc_ns
        result.frame_ref.session_id = frame.session_id

        result.model_family = "yolo"
        result.model_name = os.path.basename(self.model_manager.config.model_path)
        result.model_version = "v8"

        result.lat.pre_ms = latency["pre_ms"]
        result.lat.infer_ms = latency["infer_ms"]
        result.lat.post_ms = latency["post_ms"]
        result.lat.total_ms = latency["total_ms"]

        # Add detections
        for idx, det in enumerate(detections):
            d = result.detections.items.add()
            d.bbox.x1 = float(det[0])
            d.bbox.y1 = float(det[1])
            d.bbox.x2 = float(det[2])
            d.bbox.y2 = float(det[3])
            d.conf = float(det[4])
            cls_idx = int(det[5])
            d.cls = self.model_manager.class_names[cls_idx] if cls_idx < len(self.model_manager.class_names) else f"class_{cls_idx}"
            d.track_id = f"T{idx + 1}"

        logger.debug(f"Inference done: frame_id={frame.frame_id}, detections={len(detections)}, time={latency['total_ms']:.1f}ms")

        visualize_detections(frame_rgb, result, self.model_manager.class_names)

        await self.send_response(result=result)
        
        # Release credit
        if self.inflight > 0:
            self.inflight -= 1
            logger.debug(f"Metrics: queue_depth={self.inflight}")
        
        # Auto-tune window size based on latency
        await self.auto_tune_window(latency['total_ms'])

    async def handle_end(self):
        """Process End"""
        logger.info("Received End request")
        self.writer.close()
        await self.writer.wait_closed()

    async def handle_heartbeat(self, hb: pb.Heartbeat):
        """Process Heartbeat"""
        logger.debug(f"Received Heartbeat: last_frame_id={hb.last_frame_id}")
        hb_resp = pb.Heartbeat()
        hb_resp.last_frame_id = self.last_frame_id
        hb_resp.tx = self.tx_count
        hb_resp.rx = self.rx_count
        await self.send_message(hb=hb_resp)

    async def auto_tune_window(self, latency_ms: float):
        """
        Auto-tune window size based on recent latencies.
        - If avg latency > threshold: decrease window (reduce load/backpressure)
        - If avg latency < threshold: increase window (allow more parallelism)
        """
        self.recent_latencies.append(latency_ms)
        if len(self.recent_latencies) > self.max_recent_latencies:
            self.recent_latencies.pop(0)
        
        # Need at least 5 samples for tuning
        if len(self.recent_latencies) < 5:
            return
        
        avg_latency = sum(self.recent_latencies) / len(self.recent_latencies)
        old_window = self.window_size
        
        # Invertir lógica: alta latencia → reducir ventana, baja latencia → aumentar ventana
        if avg_latency > self.high_latency_threshold_ms and self.window_size > self.min_window_size:
            # High latency: decrease window to reduce load
            self.window_size = max(self.window_size - 1, self.min_window_size)
        elif avg_latency < self.low_latency_threshold_ms and self.window_size < self.max_window_size:
            # Low latency: increase window to allow more parallelism
            self.window_size = min(self.window_size + 2, self.max_window_size)
        
        if self.window_size != old_window:
            logger.info(f"Auto-tuned window size: {old_window} → {self.window_size} (avg_lat={avg_latency:.1f}ms)")
            self.window_size_set_events_total += 1
            logger.debug(f"Metrics: window_size_set_events_total={self.window_size_set_events_total}")
            # Send WindowUpdate to client
            window_update = pb.WindowUpdate()
            window_update.new_window_size = self.window_size
            await self.send_response(window_update=window_update)

    async def send_response(self, init_ok=None, window_update=None, result=None, error=None):
        """Send Response"""
        resp = pb.Response()
        msg_type = pb.MT_UNKNOWN
        
        if init_ok:
            resp.init_ok.CopyFrom(init_ok)
            msg_type = pb.MT_INIT_OK
        elif window_update:
            resp.window_update.CopyFrom(window_update)
            msg_type = pb.MT_WINDOW_UPDATE
        elif result:
            resp.result.CopyFrom(result)
            msg_type = pb.MT_RESULT
        elif error:
            resp.error.CopyFrom(error)
            msg_type = pb.MT_ERROR

        await self.send_message(res=resp, msg_type=msg_type)

    async def send_error(self, code, message: str):
        """Send Error"""
        error = pb.Error()
        error.code = code
        error.message = message
        await self.send_response(error=error)

    async def send_message(self, req=None, res=None, hb=None, msg_type=None):
        """Send message with length-prefix"""
        envelope = pb.Envelope()
        envelope.protocol_version = 1
        envelope.stream_id = self.stream_id or "worker"
        
        if req:
            envelope.req.CopyFrom(req)
        elif res:
            envelope.res.CopyFrom(res)
        elif hb:
            envelope.hb.CopyFrom(hb)
            msg_type = pb.MT_HEARTBEAT
        
        if msg_type:
            envelope.msg_type = msg_type

        msg_bytes = envelope.SerializeToString()
        length = struct.pack("<I", len(msg_bytes))

        self.writer.write(length)
        self.writer.write(msg_bytes)
        await self.writer.drain()
        
        self.tx_count += 1


class AIWorker:
    """Worker principal"""

    def __init__(self):
        self.state = WorkerState.IDLE
        self.model_manager = ModelManager()
        self.connections: Set[ConnectionHandler] = set()
        self.idle_timer: Optional[asyncio.Task] = None

    async def start(self):
        """Start AI Worker"""
        logger.info(f"Starting AI Worker on {BIND_HOST}:{BIND_PORT}")

        # Bootstrap (optional)
        if BOOTSTRAP_MODEL_PATH and BOOTSTRAP_WIDTH and BOOTSTRAP_HEIGHT and BOOTSTRAP_CONF:
            logger.info("Bootstrap model loading enabled")
            config = ModelConfig(
                model_path=BOOTSTRAP_MODEL_PATH,
                width=BOOTSTRAP_WIDTH,
                height=BOOTSTRAP_HEIGHT,
                conf_threshold=BOOTSTRAP_CONF,
            )
            self.state = WorkerState.LOADING
            self.model_manager.load(config)
            self.state = WorkerState.READY

        # TCP server
        server = await asyncio.start_server(self.handle_connection, BIND_HOST, BIND_PORT)

        logger.info(f"AI Worker listening on {BIND_HOST}:{BIND_PORT}")

        async with server:
            await server.serve_forever()

    async def handle_connection(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        """Nueva conexión"""
        # Cancelar timer de idle si existe
        if self.idle_timer:
            self.idle_timer.cancel()
            self.idle_timer = None
            logger.info("Idle timer cancelled (new connection)")

        handler = ConnectionHandler(reader, writer, self.model_manager, lambda: self.on_disconnect(handler))
        self.connections.add(handler)

        await handler.handle()

    async def on_disconnect(self, handler: ConnectionHandler):
        """Conexión cerrada"""
        self.connections.discard(handler)

        # Si no hay conexiones, arrancar timer de idle
        if len(self.connections) == 0:
            logger.info(f"No connections, starting idle timer ({IDLE_TIMEOUT_SEC}s)")
            self.idle_timer = asyncio.create_task(self.idle_timeout())

    async def idle_timeout(self):
        """Timer de inactividad"""
        try:
            await asyncio.sleep(IDLE_TIMEOUT_SEC)

            if len(self.connections) == 0:
                logger.info("Idle timeout reached, unloading model")
                self.model_manager.unload()
                self.state = WorkerState.IDLE
            else:
                logger.info("Connections active, idle timeout cancelled")

        except asyncio.CancelledError:
            logger.debug("Idle timer cancelled")


async def main():
    worker = AIWorker()
    await worker.start()


if __name__ == "__main__":
    asyncio.run(main())
