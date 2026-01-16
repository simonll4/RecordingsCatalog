"""Gestión de tareas de carga de modelos"""

import asyncio
from typing import Optional, Callable, Awaitable

from ..core.logger import setup_logger
from ..pipeline.model_manager import ModelManager

logger = setup_logger("server.model_loader")


class ModelLoadJob:
    """Gestiona la carga asíncrona de un modelo"""

    def __init__(
        self,
        model_manager: ModelManager,
        on_success: Optional[Callable[[str], Awaitable[None]]] = None,
        on_error: Optional[Callable[[str, Exception], Awaitable[None]]] = None,
    ):
        """
        Args:
            model_manager: Gestor de modelos
            on_success: Callback cuando la carga es exitosa (recibe model_path)
            on_error: Callback cuando hay error (recibe model_path y exception)
        """
        self.model_manager = model_manager
        self.on_success = on_success
        self.on_error = on_error
        self.task: Optional[asyncio.Task] = None
        self.current_model_path: Optional[str] = None

    def start(self, model_path: str):
        """
        Inicia la carga de un modelo

        Args:
            model_path: Ruta al modelo a cargar
        """
        # Cancelar carga anterior si existe
        self.cancel()

        self.current_model_path = model_path
        self.task = asyncio.create_task(self._load(model_path))

    async def _load(self, model_path: str):
        """Carga el modelo y ejecuta callbacks"""
        try:
            logger.info(f"[DEBUG] Iniciando carga de modelo: {model_path}")
            await self.model_manager.load(model_path)
            logger.info(f"[DEBUG] Modelo cargado exitosamente: {model_path}")

            if self.on_success:
                logger.info(f"[DEBUG] Ejecutando callback on_success para {model_path}")
                await self.on_success(model_path)
                logger.info(f"[DEBUG] Callback on_success completado para {model_path}")

        except asyncio.CancelledError:
            logger.info(f"[DEBUG] Carga de modelo cancelada: {model_path}")
            raise
        except Exception as e:
            logger.error(
                f"[DEBUG] Error cargando modelo {model_path}: {e}", exc_info=True
            )

            if self.on_error:
                await self.on_error(model_path, e)

    def cancel(self):
        """Cancela la carga en progreso"""
        if self.task and not self.task.done():
            self.task.cancel()
            logger.info(f"Cancelando carga de modelo: {self.current_model_path}")

    async def wait(self):
        """Espera a que termine la carga"""
        if self.task:
            try:
                await self.task
            except asyncio.CancelledError:
                pass

    def is_loading(self) -> bool:
        """Verifica si hay una carga en progreso"""
        return self.task is not None and not self.task.done()

    def get_current_model_path(self) -> Optional[str]:
        """Retorna la ruta del modelo que se está cargando"""
        return self.current_model_path if self.is_loading() else None
