"""
AI Worker - Worker de Inferencia con ONNX Runtime

Estados globales:
- IDLE: Sin modelo cargado, sin clientes
- LOADING: Cargando/cambiando modelo
- READY: Modelo cargado, listo para conexiones
- SESSION_ACTIVE: Procesando frames (por conexión)

Reglas:
- Desconexión → arranca timer de inactividad (IDLE_TIMEOUT_SEC)
- Sin reconexión antes del timeout → unload modelo → IDLE
- Nueva conexión antes del timeout → cancela timer → sigue en READY
- Hot-reload: Init diferente mientras hay conexión → LOADING → recarga → READY
"""

import asyncio
import logging
import os
import struct
import time
from dataclasses import dataclass
from enum import Enum
from typing import Dict, Optional, Set

import ai_pb2
import numpy as np
import onnxruntime as ort


VISUALIZATION_ENABLED = False
# Visualización (opcional, solo si CV2 está disponible)
# try:
#     import cv2
#     VISUALIZATION_ENABLED = True
# except ImportError:
#     VISUALIZATION_ENABLED = False
#     print("Warning: opencv-python not installed, visualization disabled")

# Configuración
BIND_HOST = os.getenv("BIND_HOST", "0.0.0.0")
BIND_PORT = int(os.getenv("BIND_PORT", "7001"))
IDLE_TIMEOUT_SEC = int(os.getenv("IDLE_TIMEOUT_SEC", "60"))

# Visualización
ENABLE_VISUALIZATION = os.getenv("ENABLE_VISUALIZATION", "false").lower() == "true"
VISUALIZATION_WINDOW_NAME = "AI Worker - Detections"

if ENABLE_VISUALIZATION and VISUALIZATION_ENABLED:
    print(f"✓ Visualization ENABLED (cv2 available)")
elif ENABLE_VISUALIZATION and not VISUALIZATION_ENABLED:
    print(f"✗ Visualization requested but cv2 not available")
else:
    print(f"✗ Visualization DISABLED")

# Bootstrap (opcional)
BOOTSTRAP_MODEL_PATH = os.getenv("BOOTSTRAP_MODEL_PATH")
BOOTSTRAP_WIDTH = int(os.getenv("BOOTSTRAP_WIDTH", "640")) if os.getenv("BOOTSTRAP_WIDTH") else None
BOOTSTRAP_HEIGHT = int(os.getenv("BOOTSTRAP_HEIGHT", "480")) if os.getenv("BOOTSTRAP_HEIGHT") else None
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
    """Configuración del modelo"""
    model_path: str
    width: int
    height: int
    conf_threshold: float
    classes_filter: Set[int]

    def __hash__(self):
        return hash((self.model_path, self.width, self.height, self.conf_threshold, tuple(sorted(self.classes_filter))))

    def __eq__(self, other):
        if not isinstance(other, ModelConfig):
            return False
        return (
            self.model_path == other.model_path
            and self.width == other.width
            and self.height == other.height
            and self.conf_threshold == other.conf_threshold
            and self.classes_filter == other.classes_filter
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

    def infer(self, frame_rgb: np.ndarray, session_id: str) -> ai_pb2.Result:
        """Inferencia sobre frame RGB"""
        if not self.session or not self.config:
            raise RuntimeError("Model not loaded")

        # Preprocesar
        input_tensor = self._preprocess(frame_rgb)

        # Inferir
        input_name = self.session.get_inputs()[0].name
        outputs = self.session.run(None, {input_name: input_tensor})

        # Postprocesar
        detections = self._postprocess(outputs[0], frame_rgb.shape[:2])

        # Crear Result con track_id estable
        result = ai_pb2.Result()
        result.session_id = session_id  # Incluir sessionId
        
        for idx, det in enumerate(detections):
            d = result.detections.add()
            d.cls = self.class_names[int(det[5])] if int(det[5]) < len(self.class_names) else f"class_{int(det[5])}"
            d.conf = float(det[4])
            d.bbox.x = float(det[0])
            d.bbox.y = float(det[1])
            d.bbox.w = float(det[2] - det[0])
            d.bbox.h = float(det[3] - det[1])
            # Track ID simple: T1, T2, T3... (por ahora siempre el mismo por frame)
            d.track_id = f"T{idx + 1}"

        return result

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


def visualize_detections(frame_rgb, result, class_names):
    """
    Muestra el frame con las detecciones dibujadas usando OpenCV.
    
    Args:
        frame_rgb: Frame en formato RGB (H, W, 3)
        result: Resultado de inferencia con detecciones
        class_names: Lista de nombres de clases
    """
    if not VISUALIZATION_ENABLED or not ENABLE_VISUALIZATION:
        return
    
    logger.debug(f"Visualizing seq={result.seq} with {len(result.detections)} detections")
    
    # Convertir RGB a BGR para OpenCV
    frame_bgr = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
    h, w = frame_bgr.shape[:2]
    
    # Dibujar cada detección
    for det in result.detections:
        # Bounding box - las coordenadas YA vienen en píxeles absolutos
        x = int(det.bbox.x)
        y = int(det.bbox.y)
        box_w = int(det.bbox.w)
        box_h = int(det.bbox.h)
        
        # Validar que la bbox está dentro del frame
        if x < 0 or y < 0 or x + box_w > w or y + box_h > h:
            continue
        
        # Color verde para todas las detecciones
        color = (0, 255, 0)
        
        # Dibujar rectángulo
        cv2.rectangle(frame_bgr, (x, y), (x + box_w, y + box_h), color, 2)
        
        # Texto con clase y confianza
        label = f"{det.cls}: {det.conf:.2f}"
        
        # Fondo para el texto
        (text_w, text_h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(frame_bgr, (x, y - text_h - 4), (x + text_w, y), color, -1)
        
        # Texto blanco
        cv2.putText(
            frame_bgr,
            label,
            (x, y - 2),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 0, 0),
            1,
            cv2.LINE_AA,
        )
    
    # Info del frame
    info_text = f"Seq: {result.seq} | Detections: {len(result.detections)}"
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
    """Gestor de conexión individual"""

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
        self.credit = False  # Ventana 1
        self.seq = 0
        self.session_id = "unknown"  # Se actualiza con el primer frame

    async def handle(self):
        """Loop principal de la conexión"""
        logger.info(f"Client connected: {self.peer}")

        try:
            while True:
                # Leer length-prefix (uint32LE)
                logger.debug(f"Waiting for length-prefix from {self.peer}")
                length_bytes = await self.reader.readexactly(4)
                length = struct.unpack("<I", length_bytes)[0]
                logger.debug(f"Received message length: {length} bytes from {self.peer}")

                # Leer mensaje
                msg_bytes = await self.reader.readexactly(length)

                # Decodificar
                envelope = ai_pb2.Envelope()
                envelope.ParseFromString(msg_bytes)

                # Procesar
                await self.handle_message(envelope)

        except asyncio.IncompleteReadError:
            logger.info(f"Client disconnected: {self.peer}")
        except Exception as e:
            logger.error(f"Error handling connection {self.peer}: {e}")
        finally:
            self.writer.close()
            await self.writer.wait_closed()
            await self.on_disconnect()

    async def handle_message(self, envelope: ai_pb2.Envelope):
        """Procesar mensaje entrante"""
        if envelope.HasField("req"):
            await self.handle_request(envelope.req)
        elif envelope.HasField("hb"):
            await self.handle_heartbeat(envelope.hb)

    async def handle_request(self, req: ai_pb2.Request):
        """Procesar Request"""
        if req.HasField("init"):
            await self.handle_init(req.init)
        elif req.HasField("frame"):
            await self.handle_frame(req.frame)
        elif req.HasField("shutdown"):
            await self.handle_shutdown()

    async def handle_init(self, init: ai_pb2.Init):
        """Procesar Init"""
        logger.info(f"Received Init: model={init.model_path}, resolution={init.width}x{init.height}")

        config = ModelConfig(
            model_path=init.model_path,
            width=init.width,
            height=init.height,
            conf_threshold=init.conf_threshold,
            classes_filter=set(init.classes_filter),
        )

        # Hot-reload si config cambió
        if self.model_manager.config != config:
            logger.info("Config changed, reloading model")
            self.model_manager.load(config)

        # InitOk
        init_ok = ai_pb2.InitOk()
        init_ok.runtime = f"onnxruntime {ort.__version__}"
        init_ok.model_version = os.path.basename(init.model_path)
        init_ok.class_names.extend(self.model_manager.class_names)
        init_ok.max_frame_bytes = 640 * 480 * 3 * 2  # 2x buffer
        init_ok.providers.extend(self.model_manager.session.get_providers())
        init_ok.model_id = self.model_manager.model_id
        init_ok.preproc.layout = "NCHW"
        init_ok.preproc.letterbox = True

        await self.send_response(init_ok=init_ok)

        # Dar crédito inicial
        ready = ai_pb2.Ready(seq=0)
        await self.send_response(ready=ready)
        self.credit = True

        logger.info("Sent InitOk + Ready")

    async def handle_frame(self, frame: ai_pb2.Frame):
        """Procesar Frame"""
        if not self.credit:
            logger.warning(f"Received frame without credit, dropping seq={frame.seq}")
            return

        self.credit = False
        self.seq = frame.seq
        
        # Extraer session_id del frame si está disponible
        if frame.session_id:
            self.session_id = frame.session_id

        logger.debug(f"Processing frame seq={frame.seq}, session={self.session_id}, size={len(frame.data)}")

        # Validar tamaño del frame
        expected_size = frame.height * frame.width * 3
        if len(frame.data) != expected_size:
            logger.error(f"Invalid frame size: expected={expected_size}, got={len(frame.data)}")
            return

        # Decodificar RGB
        try:
            frame_rgb = np.frombuffer(frame.data, dtype=np.uint8).reshape((frame.height, frame.width, 3))
        except ValueError as e:
            logger.error(f"Failed to reshape frame: {e}")
            return

        # Inferir (pasar session_id)
        start = time.perf_counter()
        result = self.model_manager.infer(frame_rgb, self.session_id)
        elapsed_ms = (time.perf_counter() - start) * 1000

        result.seq = frame.seq
        result.ts_iso = frame.ts_iso
        result.ts_mono_ns = frame.ts_mono_ns

        logger.debug(f"Inference done: seq={frame.seq}, detections={len(result.detections)}, time={elapsed_ms:.1f}ms")

        # Visualizar (si está habilitado)
        visualize_detections(frame_rgb, result, self.model_manager.class_names)

        # Enviar Result
        await self.send_response(result=result)

        # Dar crédito
        self.credit = True

    async def handle_shutdown(self):
        """Procesar Shutdown"""
        logger.info("Received Shutdown request")
        self.writer.close()
        await self.writer.wait_closed()

    async def handle_heartbeat(self, hb: ai_pb2.Heartbeat):
        """Procesar Heartbeat"""
        logger.debug(f"Received Heartbeat: ts_mono_ns={hb.ts_mono_ns}")

        # Responder con Heartbeat
        hb_resp = ai_pb2.Heartbeat(ts_mono_ns=int(time.monotonic_ns()))
        await self.send_message(ai_pb2.Envelope(hb=hb_resp))

    async def send_response(self, init_ok=None, ready=None, result=None, error=None):
        """Enviar Response"""
        resp = ai_pb2.Response()
        if init_ok:
            resp.init_ok.CopyFrom(init_ok)
        elif ready:
            resp.ready.CopyFrom(ready)
        elif result:
            resp.result.CopyFrom(result)
        elif error:
            resp.error.CopyFrom(error)

        await self.send_message(ai_pb2.Envelope(res=resp))

    async def send_message(self, envelope: ai_pb2.Envelope):
        """Enviar mensaje con length-prefix"""
        msg_bytes = envelope.SerializeToString()
        length = struct.pack("<I", len(msg_bytes))

        self.writer.write(length)
        self.writer.write(msg_bytes)
        await self.writer.drain()


class AIWorker:
    """Worker principal"""

    def __init__(self):
        self.state = WorkerState.IDLE
        self.model_manager = ModelManager()
        self.connections: Set[ConnectionHandler] = set()
        self.idle_timer: Optional[asyncio.Task] = None

    async def start(self):
        """Iniciar worker"""
        logger.info(f"Starting AI Worker on {BIND_HOST}:{BIND_PORT}")

        # Bootstrap (opcional)
        if BOOTSTRAP_MODEL_PATH and BOOTSTRAP_WIDTH and BOOTSTRAP_HEIGHT and BOOTSTRAP_CONF:
            logger.info("Bootstrap model loading enabled")
            config = ModelConfig(
                model_path=BOOTSTRAP_MODEL_PATH,
                width=BOOTSTRAP_WIDTH,
                height=BOOTSTRAP_HEIGHT,
                conf_threshold=BOOTSTRAP_CONF,
                classes_filter=set(),
            )
            self.state = WorkerState.LOADING
            self.model_manager.load(config)
            self.state = WorkerState.READY

        # Servidor TCP
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
