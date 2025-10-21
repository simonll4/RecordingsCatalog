"""Tarea de heartbeat periódico durante carga de modelo"""

import asyncio
from typing import Callable, Awaitable

from ..core.logger import setup_logger

logger = setup_logger("server.heartbeat")


class HeartbeatTask:
    """Gestiona envío de heartbeats periódicos"""

    def __init__(
        self,
        send_heartbeat: Callable[[], Awaitable[None]],
        interval_seconds: float = 2.0,
    ):
        """
        Args:
            send_heartbeat: Función async para enviar heartbeat
            interval_seconds: Intervalo entre heartbeats
        """
        self.send_heartbeat = send_heartbeat
        self.interval_seconds = interval_seconds
        self.task: asyncio.Task = None
        self._running = False

    def start(self, condition: Callable[[], bool]):
        """
        Inicia el envío de heartbeats mientras la condición sea True

        Args:
            condition: Función que retorna True mientras se deba enviar heartbeats
        """
        if self._running:
            logger.warning("Heartbeat task ya está corriendo")
            return

        self._running = True
        self.task = asyncio.create_task(self._run(condition))

    async def _run(self, condition: Callable[[], bool]):
        """Loop de heartbeats"""
        try:
            while condition() and self._running:
                await self.send_heartbeat()
                await asyncio.sleep(self.interval_seconds)
        except asyncio.CancelledError:
            logger.debug("Heartbeat task cancelada")
            raise
        except Exception as e:
            logger.warning(f"Error en heartbeat task: {e}")
        finally:
            self._running = False

    def stop(self):
        """Detiene el envío de heartbeats"""
        self._running = False
        if self.task and not self.task.done():
            self.task.cancel()

    async def wait(self):
        """Espera a que termine la tarea"""
        if self.task:
            try:
                await self.task
            except asyncio.CancelledError:
                pass
