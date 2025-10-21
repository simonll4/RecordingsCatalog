"""Gestión de modelos YOLO11 con pooling y carga asíncrona"""

import asyncio
from typing import Optional, Dict, List
from pathlib import Path

from ..core.logger import setup_logger
from ..inference.yolo11 import YOLO11Model, Detection

logger = setup_logger("pipeline.model_manager")


class ModelManager:
    """Administra instancias de modelos YOLO11 con pooling"""

    def __init__(self, conf_threshold: float = 0.5, nms_iou: float = 0.6):
        """
        Args:
            conf_threshold: Umbral de confianza por defecto
            nms_iou: Umbral IoU para NMS por defecto
        """
        self.conf_threshold = conf_threshold
        self.nms_iou = nms_iou
        self._models: Dict[str, YOLO11Model] = {}
        self._loading_tasks: Dict[str, asyncio.Task] = {}

    async def load(self, model_path: str) -> YOLO11Model:
        """
        Carga un modelo (o retorna el cacheado si ya existe)

        Args:
            model_path: Ruta al modelo ONNX

        Returns:
            Instancia del modelo cargado

        Raises:
            Exception: Si falla la carga del modelo
        """
        model_path = str(Path(model_path).resolve())

        # Si ya está cargado, retornar
        if model_path in self._models:
            logger.info(f"Modelo ya cargado (pool): {model_path}")
            return self._models[model_path]

        # Si está en proceso de carga, esperar
        if model_path in self._loading_tasks:
            logger.info(f"Esperando carga en progreso: {model_path}")
            return await self._loading_tasks[model_path]

        # Iniciar carga asíncrona
        logger.info(f"Iniciando carga de modelo: {model_path}")
        task = asyncio.create_task(self._load_model(model_path))
        self._loading_tasks[model_path] = task

        try:
            model = await task
            self._models[model_path] = model
            return model
        finally:
            self._loading_tasks.pop(model_path, None)

    async def _load_model(self, model_path: str) -> YOLO11Model:
        """Carga el modelo en un thread separado"""
        try:
            model = await asyncio.to_thread(YOLO11Model, model_path)
            logger.info(f"Modelo cargado exitosamente: {model_path}")
            return model
        except Exception as e:
            logger.error(f"Error cargando modelo {model_path}: {e}")
            raise

    def get(self, model_path: str) -> Optional[YOLO11Model]:
        """
        Obtiene un modelo del pool (sin cargar)

        Args:
            model_path: Ruta al modelo

        Returns:
            Modelo si está cargado, None en caso contrario
        """
        model_path = str(Path(model_path).resolve())
        return self._models.get(model_path)

    def infer(
        self,
        model_path: str,
        image,
        conf_thres: Optional[float] = None,
        nms_iou: Optional[float] = None,
        classes_filter: Optional[List[int]] = None,
    ) -> List[Detection]:
        """
        Ejecuta inferencia con un modelo del pool

        Args:
            model_path: Ruta al modelo
            image: Imagen BGR (HxWx3)
            conf_thres: Umbral de confianza (usa default si es None)
            nms_iou: Umbral IoU para NMS (usa default si es None)
            classes_filter: Lista de IDs de clases a detectar

        Returns:
            Lista de detecciones

        Raises:
            ValueError: Si el modelo no está cargado
        """
        model = self.get(model_path)
        if model is None:
            raise ValueError(f"Modelo no cargado: {model_path}")

        return model.infer(
            image,
            conf_thres=conf_thres or self.conf_threshold,
            nms_iou=nms_iou or self.nms_iou,
            classes_filter=classes_filter,
        )

    def unload(self, model_path: str):
        """
        Descarga un modelo del pool

        Args:
            model_path: Ruta al modelo
        """
        model_path = str(Path(model_path).resolve())
        if model_path in self._models:
            del self._models[model_path]
            logger.info(f"Modelo descargado del pool: {model_path}")

    def clear(self):
        """Descarga todos los modelos del pool"""
        count = len(self._models)
        self._models.clear()
        logger.info(f"Pool de modelos limpiado ({count} modelos)")
