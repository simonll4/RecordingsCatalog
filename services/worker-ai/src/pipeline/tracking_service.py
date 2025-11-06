"""Servicio de tracking que encapsula BoTSORTTracker"""

from typing import List, Optional

from ..core.logger import setup_logger
from ..tracking.botsort import BoTSORTTracker, Track
from ..inference.yolo11 import Detection

logger = setup_logger("pipeline.tracking")


class TrackingService:
    """Servicio que gestiona el tracker con control de sesiones"""

    def __init__(
        self,
        config_path: str = "botsort.yaml",
        enabled: bool = True,
        use_kalman: bool = True,
    ):
        """
        Args:
            config_path: Ruta al archivo de configuración del tracker
            enabled: Si el tracking está habilitado
            use_kalman: Si se usa Kalman Filter para suavizado
        """
        self.enabled = enabled
        self.config_path = config_path
        self.use_kalman = use_kalman

        if self.enabled:
            self.tracker = BoTSORTTracker(config_path, use_kalman=use_kalman)
            logger.info(
                f"Tracking habilitado con config: {config_path} "
                f"(Kalman: {'enabled' if use_kalman else 'disabled'})"
            )
        else:
            self.tracker = None
            logger.info("Tracking deshabilitado")

    def update(self, detections: List[Detection]) -> List[Track]:
        """
        Actualiza el tracker con nuevas detecciones

        Args:
            detections: Lista de detecciones del frame actual

        Returns:
            Lista de tracks activos (vacía si tracking deshabilitado)
        """
        if not self.enabled or self.tracker is None:
            return []

        all_tracks = self.tracker.update(detections)

        # Filtrar solo tracks activos en este frame
        active_tracks = [
            t for t in all_tracks if (self.tracker.frame_idx - t.last_seen_frame) == 0
        ]

        return active_tracks

    def reset(self):
        """Resetea el tracker (para nueva sesión)"""
        if self.tracker:
            self.tracker.reset()
            logger.info("Tracker reseteado")

    def get_frame_idx(self) -> int:
        """Retorna el índice de frame actual del tracker"""
        if self.tracker:
            return self.tracker.frame_idx
        return 0
