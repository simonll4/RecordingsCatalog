#!/usr/bin/env python3
"""
Worker AI - Servicio de inferencia y tracking

Servidor TCP que recibe frames del edge-agent, ejecuta YOLO11 para detectar objetos,
aplica tracking BoT-SORT, y persiste los resultados en JSON por sesión.

Estructura modular:
- src/core: Configuración y logging
- src/inference: Modelo YOLO11 ONNX
- src/tracking: Tracker BoT-SORT
- src/session: Gestión de sesiones y persistencia
- src/visualization: Visualización con OpenCV
- src/protocol: Protocolo Protobuf v1
"""
import asyncio
import cv2
import numpy as np
from typing import Optional

# Importar protobuf
import ai_pb2 as pb

# Módulos propios
from src.core.config import Config
from src.core.logger import setup_logger
from src.inference.yolo11 import YOLO11Model
from src.tracking.botsort import BoTSORTTracker
from src.session.manager import SessionManager, SessionWriter
from src.visualization.viewer import Visualizer
from src.protocol.handler import ProtocolHandler

logger = setup_logger("worker")


class ConnectionHandler:
    """Maneja una conexión de cliente (edge-agent)"""
    
    def __init__(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
        config: Config,
        session_manager: SessionManager,
        worker: "WorkerAI"
    ):
        self.reader = reader
        self.writer = writer
        self.config = config
        self.session_manager = session_manager
        self.worker = worker
        
        self.protocol = ProtocolHandler(reader, writer)
        self.peer = self.protocol.peer
        
        # Modelo (se carga cuando llega Init)
        self.model: Optional[YOLO11Model] = None
        self.model_path: Optional[str] = None
        self.model_conf: float = 0.35
        
        # Tracker (uno por conexión)
        if config.tracker.enabled:
            self.tracker = BoTSORTTracker(config.tracker.config_path)
            logger.info("Tracker habilitado")
        else:
            self.tracker = None
            logger.info("Tracker deshabilitado")
        
        # Sesión actual
        self.current_session_id: Optional[str] = None
        self.session_writer: Optional[SessionWriter] = None
        self.frame_idx = 0
        self.last_closed_session_id: Optional[str] = None

    def _finalize_session(self, reason: str):
        """Cierra la sesión activa y resetea el tracker"""
        closed_session_id = self.current_session_id
        if self.current_session_id:
            try:
                self.session_manager.end_session(self.current_session_id)
            except Exception as exc:
                logger.error(
                    f"Error finalizando sesión {self.current_session_id}: {exc}",
                    exc_info=True,
                )
            if reason:
                logger.info(f"Sesión finalizada: {self.current_session_id} ({reason})")
            else:
                logger.info(f"Sesión finalizada: {self.current_session_id}")

        had_session = self.current_session_id is not None

        self.current_session_id = None
        self.session_writer = None
        self.frame_idx = 0

        if self.tracker and had_session:
            self.tracker.reset()
        
        if closed_session_id:
            self.last_closed_session_id = closed_session_id
    
    async def handle(self):
        """Loop principal de la conexión"""
        logger.info(f"Cliente conectado: {self.peer}")
        
        try:
            while True:
                # Leer envelope
                envelope = await self.protocol.read_envelope()
                if envelope is None:
                    break
                
                if envelope.msg_type == pb.MT_END:
                    await self.handle_end()
                    continue
                
                # Procesar según tipo de mensaje
                if envelope.HasField("req"):
                    await self.handle_request(envelope.req)
                elif envelope.HasField("hb"):
                    # Heartbeat - responder con heartbeat
                    await self.protocol.send_heartbeat()
                else:
                    logger.warning(f"Envelope sin request: {envelope.msg_type}")
        
        except Exception as e:
            logger.error(f"Error en conexión {self.peer}: {e}", exc_info=True)
        
        finally:
            self._finalize_session("conexión cerrada")
            self.protocol.close()
            await self.writer.wait_closed()
            logger.info(f"Cliente desconectado: {self.peer}")

    async def handle_request(self, req: pb.Request):
        """Procesa un Request"""
        if req.HasField("init"):
            await self.handle_init(req.init)
        elif req.HasField("frame"):
            logger.info(f"Frame recibido: session={req.frame.session_id}, frame_id={req.frame.frame_id}")
            await self.handle_frame(req.frame)
        elif req.HasField("end"):
            await self.handle_end()
        else:
            logger.warning("Request sin init, frame o end")
    
    async def handle_init(self, init: pb.Init):
        """Maneja mensaje Init (configuración del modelo)"""
        logger.info(f"Init recibido: model={init.model}")
        
        # Cargar modelo si cambió
        if self.model_path != init.model:
            try:
                # Extraer conf_threshold si está en capabilities
                conf = self.model_conf
                if init.HasField("caps") and hasattr(init.caps, "conf_threshold"):
                    conf = init.caps.conf_threshold if init.caps.conf_threshold > 0 else conf
                
                self.model = YOLO11Model(init.model, conf_threshold=conf)
                self.model_path = init.model
                self.model_conf = conf
                logger.info(f"Modelo cargado: {init.model}")
            except Exception as e:
                logger.error(f"Error cargando modelo: {e}")
                await self.protocol.send_error(pb.INTERNAL, f"Failed to load model: {e}")
                raise
        
        # Enviar InitOk para que el edge-agent empiece a enviar frames
        await self.protocol.send_init_ok()
    
    async def handle_frame(self, frame_msg: pb.Frame):
        """Maneja mensaje Frame (inferencia + tracking)"""
        if self.model is None:
            logger.warning("Frame recibido pero modelo no cargado")
            await self.protocol.send_error(pb.MODEL_NOT_READY, "Model not initialized")
            return
        
        raw_session = frame_msg.session_id or ""
        trimmed_session = raw_session.strip()

        session_id: Optional[str]
        if trimmed_session:
            try:
                session_id = SessionManager.normalize_session_id(trimmed_session)
            except ValueError as e:
                logger.error(f"Frame con session_id inválido: '{frame_msg.session_id}': {e}")
                await self.protocol.send_error(pb.BAD_MESSAGE, str(e))
                return
        else:
            session_id = None

        # Gestionar estado de sesión
        if session_id is None:
            if self.current_session_id:
                self._finalize_session("session_id vacío, se asume fin")
        else:
            if self.current_session_id and session_id != self.current_session_id:
                self._finalize_session("cambio de sesión")

            if self.current_session_id is None and session_id != self.last_closed_session_id:
                try:
                    writer = self.session_manager.start_session(
                        session_id,
                        fps=None  # FPS no está en el Frame message, usar default
                    )
                except ValueError as e:
                    logger.error(f"No se pudo iniciar sesión '{session_id}': {e}")
                    await self.protocol.send_error(pb.BAD_MESSAGE, str(e))
                    return

                self.current_session_id = session_id
                self.last_closed_session_id = None
                self.session_writer = writer
                self.frame_idx = 0
                logger.info(f"Nueva sesión iniciada: {session_id}")

            elif self.current_session_id is None and session_id == self.last_closed_session_id:
                logger.debug(
                    f"Frame recibido para sesión ya cerrada {session_id}, omitiendo tracking/persistencia"
                )

        # Decodificar imagen según formato
        try:
            if frame_msg.codec == pb.CODEC_JPEG:
                # Decodificar JPEG
                np_arr = np.frombuffer(frame_msg.data, np.uint8)
                img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
                
                if img is None:
                    logger.error("No se pudo decodificar JPEG")
                    await self.protocol.send_error(pb.BAD_MESSAGE, "Failed to decode JPEG")
                    return
            
            elif frame_msg.pixel_format == pb.PF_NV12:
                # Decodificar NV12 a BGR
                width = frame_msg.width
                height = frame_msg.height
                
                # NV12: Y plane (width*height) + UV plane (width*height/2)
                y_size = width * height
                uv_size = width * height // 2
                
                if len(frame_msg.data) < y_size + uv_size:
                    logger.error(f"Frame NV12 incompleto: esperado {y_size + uv_size}, recibido {len(frame_msg.data)}")
                    await self.protocol.send_error(pb.INVALID_FRAME, "Incomplete NV12 frame")
                    return
                
                # Convertir NV12 a BGR usando OpenCV
                nv12_data = np.frombuffer(frame_msg.data[:y_size + uv_size], dtype=np.uint8)
                yuv = nv12_data.reshape((height * 3 // 2, width))
                img = cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR_NV12)
            
            elif frame_msg.pixel_format == pb.PF_I420:
                # Decodificar I420 a BGR
                width = frame_msg.width
                height = frame_msg.height
                
                y_size = width * height
                u_size = width * height // 4
                v_size = width * height // 4
                
                if len(frame_msg.data) < y_size + u_size + v_size:
                    logger.error(f"Frame I420 incompleto")
                    await self.protocol.send_error(pb.INVALID_FRAME, "Incomplete I420 frame")
                    return
                
                i420_data = np.frombuffer(frame_msg.data[:y_size + u_size + v_size], dtype=np.uint8)
                yuv = i420_data.reshape((height * 3 // 2, width))
                img = cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR_I420)
            
            else:
                logger.error(f"Formato no soportado: pixel_format={frame_msg.pixel_format}, codec={frame_msg.codec}")
                await self.protocol.send_error(pb.UNSUPPORTED_FORMAT, f"Unsupported format")
                return
        
        except Exception as e:
            logger.error(f"Error decodificando frame: {e}")
            await self.protocol.send_error(pb.INVALID_FRAME, f"Frame decode error: {e}")
            return
        
        # Inferencia
        detections = self.model.infer(img)

        tracking_active = self.tracker is not None and self.current_session_id is not None

        # Tracking (solo con sesión activa)
        if tracking_active:
            all_tracks = self.tracker.update(detections)
            # Filtrar solo tracks activos en este frame (actualizados recientemente)
            tracks = [t for t in all_tracks if (self.tracker.frame_idx - t.last_seen_frame) == 0]
        else:
            tracks = []

        # Persistir a sesión (solo si hay tracks)
        if tracking_active and self.session_writer and len(tracks) > 0:
            self.session_writer.write_frame(tracks, self.frame_idx)

        # Visualizar
        visualizer = self.worker.get_visualizer()
        if visualizer and tracking_active:
            visualizer.show(img, tracks)

        # Enviar respuesta al edge-agent
        response_dets = []
        img_h, img_w = img.shape[:2]
        if tracking_active:
            for track in tracks:
                x1, y1, x2, y2 = track.bbox
                response_dets.append({
                    "x1": x1,
                    "y1": y1,
                    "x2": x2,
                    "y2": y2,
                    "confidence": track.confidence,
                    "class_name": track.class_name,
                    "track_id": track.track_id
                })
        else:
            for idx, det in enumerate(detections):
                x1, y1, x2, y2 = det.bbox
                response_dets.append({
                    "x1": x1,
                    "y1": y1,
                    "x2": x2,
                    "y2": y2,
                    "confidence": det.confidence,
                    "class_name": det.class_name,
                    "track_id": f"det-{frame_msg.frame_id}-{idx}"
                })

        await self.protocol.send_response(response_dets, frame_msg.frame_id, session_id or "")

        self.frame_idx += 1

    async def handle_end(self):
        """Maneja mensaje End (fin de sesión solicitado por el edge-agent)"""
        if not self.current_session_id:
            logger.info("End recibido pero no hay sesión activa")
            return

        logger.info(f"End recibido. Cerrando sesión {self.current_session_id}")
        self._finalize_session("End recibido desde edge-agent")


class WorkerAI:
    """Servidor principal del Worker AI"""
    
    def __init__(self, config: Config):
        self.config = config
        self.session_manager = SessionManager(
            config.sessions.output_dir,
            config.sessions.default_fps
        )
        
        # Visualizador (lazy init cuando llega primer frame)
        self.visualizer = None
        self.visualization_enabled = config.visualization.enabled
    
    def get_visualizer(self):
        """Obtiene visualizador (lazy init)"""
        if not self.visualization_enabled:
            return None
        
        if self.visualizer is None:
            try:
                self.visualizer = Visualizer(self.config.visualization.window_name)
                logger.info("Visualización inicializada")
            except Exception as e:
                logger.warning(f"No se pudo inicializar visualización: {e}")
                self.visualization_enabled = False
        
        return self.visualizer
    
    async def handle_connection(
        self, 
        reader: asyncio.StreamReader, 
        writer: asyncio.StreamWriter
    ):
        """Callback para nueva conexión"""
        handler = ConnectionHandler(
            reader, writer, self.config, self.session_manager, self
        )
        await handler.handle()
    
    async def run(self):
        """Inicia el servidor"""
        server = await asyncio.start_server(
            self.handle_connection,
            self.config.server.bind_host,
            self.config.server.bind_port
        )
        
        logger.info(f"🚀 Worker AI escuchando en {self.config.server.bind_host}:{self.config.server.bind_port}")
        logger.info(f"📁 Output tracks: {self.config.sessions.output_dir}")
        
        async with server:
            await server.serve_forever()


async def main():
    """Función principal"""
    # Cargar configuración
    config = Config.load()
    
    # Crear y ejecutar worker
    worker = WorkerAI(config)
    
    try:
        await worker.run()
    except KeyboardInterrupt:
        logger.info("Shutdown por usuario")
    finally:
        # Cerrar todas las sesiones
        worker.session_manager.end_all_sessions()
        
        # Cerrar visualizador
        if worker.visualizer:
            worker.visualizer.close()
        
        logger.info("Worker shutdown complete")


if __name__ == "__main__":
    print("🤖 Worker AI - Starting...")
    print()
    asyncio.run(main())
