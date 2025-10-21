"""Servidor TCP principal del Worker AI"""

import asyncio
from typing import Optional

from ..core.logger import setup_logger
from ..config.runtime import RuntimeConfig
from ..pipeline.frame_decoder import FrameDecoder
from ..pipeline.model_manager import ModelManager
from ..pipeline.tracking_service import TrackingService
from ..pipeline.session_service import SessionService
from ..pipeline.processor import FrameProcessor
from ..visualization.viewer import Visualizer
from ..inference.yolo11 import COCO_CLASSES
from .connection import ConnectionHandler

logger = setup_logger("server")


class WorkerServer:
    """Servidor principal del Worker AI"""

    def __init__(self, config: RuntimeConfig):
        """
        Args:
            config: Configuración runtime completa
        """
        self.config = config

        # Inicializar componentes del pipeline
        self.decoder = FrameDecoder()

        self.model_manager = ModelManager(
            conf_threshold=config.base_config.model.conf_threshold,
            nms_iou=config.base_config.model.nms_iou,
        )

        self.tracking_service = TrackingService(
            config_path=config.base_config.tracker.config_path,
            enabled=config.base_config.tracker.enabled,
        )

        self.session_service = SessionService(
            output_dir=config.base_config.sessions.output_dir,
            default_fps=config.base_config.sessions.default_fps,
            segment_duration_s=config.base_config.sessions.segment_duration_s,
        )

        # Filtro de clases
        class_filter_ids = None
        if config.base_config.model.classes:
            class_name_to_id = {name: i for i, name in enumerate(COCO_CLASSES)}
            class_filter_ids = [
                class_name_to_id[name]
                for name in config.base_config.model.classes
                if name in class_name_to_id
            ]
            logger.info(f"Filtro de clases activo: {config.base_config.model.classes}")

        # Procesador de pipeline (uno compartido por todas las conexiones)
        # Nota: Cada conexión tendrá su propio processor para mantener estado independiente
        self.class_filter_ids = class_filter_ids

        # Visualizador (lazy init)
        self.visualizer: Optional[Visualizer] = None
        self.visualization_enabled = config.base_config.visualization.enabled

    def _get_visualizer(self) -> Optional[Visualizer]:
        """Obtiene visualizador (lazy init)"""
        if not self.visualization_enabled:
            return None

        if self.visualizer is None:
            try:
                self.visualizer = Visualizer(
                    self.config.base_config.visualization.window_name
                )
                logger.info("Visualización inicializada")
            except Exception as e:
                logger.warning(f"No se pudo inicializar visualización: {e}")
                self.visualization_enabled = False

        return self.visualizer

    def _create_processor(self) -> FrameProcessor:
        """Crea un nuevo procesador para una conexión"""
        # Cada conexión tiene su propio tracking y session service
        tracking = TrackingService(
            config_path=self.config.base_config.tracker.config_path,
            enabled=self.config.base_config.tracker.enabled,
        )

        session = SessionService(
            output_dir=self.config.base_config.sessions.output_dir,
            default_fps=self.config.base_config.sessions.default_fps,
            segment_duration_s=self.config.base_config.sessions.segment_duration_s,
        )

        return FrameProcessor(
            decoder=self.decoder,
            model_manager=self.model_manager,
            tracking_service=tracking,
            session_service=session,
            class_filter_ids=self.class_filter_ids,
        )

    async def handle_connection(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ):
        """
        Callback para nueva conexión

        Args:
            reader: StreamReader de asyncio
            writer: StreamWriter de asyncio
        """
        processor = self._create_processor()
        visualizer = self._get_visualizer()

        handler = ConnectionHandler(reader, writer, self.config, processor, visualizer)

        await handler.handle()

    async def run(self):
        """Inicia el servidor TCP"""
        server = await asyncio.start_server(
            self.handle_connection,
            self.config.base_config.server.bind_host,
            self.config.base_config.server.bind_port,
        )

        host = self.config.base_config.server.bind_host
        port = self.config.base_config.server.bind_port

        logger.info(f"🚀 Worker AI escuchando en {host}:{port}")
        logger.info(f"📁 Output tracks: {self.config.base_config.sessions.output_dir}")

        async with server:
            await server.serve_forever()

    def shutdown(self):
        """Limpieza al cerrar el servidor"""
        # Cerrar todas las sesiones
        self.session_service.end_all()

        # Cerrar visualizador
        if self.visualizer:
            self.visualizer.close()

        logger.info("Servidor cerrado")
