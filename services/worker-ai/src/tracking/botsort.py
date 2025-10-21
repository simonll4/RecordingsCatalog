"""BoT-SORT Tracker - IoU-based tracking"""

from dataclasses import dataclass
from typing import List, Dict, Tuple
import yaml

from ..core.logger import setup_logger
from ..inference.yolo11 import Detection

logger = setup_logger("tracking")


def iou_xyxy(
    a: Tuple[float, float, float, float], b: Tuple[float, float, float, float]
) -> float:
    """Calcula IoU entre dos bounding boxes en formato xyxy normalizado (0-1)"""
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b

    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)

    iw = max(0.0, inter_x2 - inter_x1)
    ih = max(0.0, inter_y2 - inter_y1)
    inter = iw * ih

    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter + 1e-6

    return inter / union


@dataclass
class Track:
    """Un track activo"""

    track_id: int
    class_id: int
    class_name: str
    confidence: float
    bbox: Tuple[float, float, float, float]  # xyxy normalizado
    last_seen_frame: int


class BoTSORTTracker:
    """
    Tracker simple basado en IoU + class matching.
    Compatible con formato de configuración BoT-SORT.
    """

    def __init__(self, config_path: str = "botsort.yaml"):
        """
        Args:
            config_path: Ruta al archivo YAML de configuración
        """
        # Defaults
        self.match_thresh = 0.3  # IoU mínimo para match
        self.max_age = 30  # Frames máximos sin detección antes de borrar

        # Cargar config
        try:
            with open(config_path, "r") as f:
                cfg = yaml.safe_load(f) or {}
            self.match_thresh = float(cfg.get("match_thresh", self.match_thresh))
            self.max_age = int(cfg.get("max_age", self.max_age))
            logger.info(
                f"Tracker config: match_thresh={self.match_thresh}, max_age={self.max_age}"
            )
        except Exception as e:
            logger.warning(
                f"No se pudo cargar config de tracker: {e}. Usando defaults."
            )

        self.next_id = 1
        self.tracks: List[Track] = []
        self.frame_idx = 0

    def update(self, detections: List[Detection]) -> List[Track]:
        """
        Actualiza el tracker con nuevas detecciones

        Args:
            detections: Lista de detecciones del frame actual

        Returns:
            Lista de tracks activos en este frame
        """
        self.frame_idx += 1

        if not detections:
            # Mantener tracks vivos
            self.tracks = [
                t
                for t in self.tracks
                if (self.frame_idx - t.last_seen_frame) <= self.max_age
            ]
            return self.tracks.copy()

        matched_track_ids = set()
        updated_tracks = []

        # Asociar detecciones con tracks existentes
        for det in detections:
            best_iou = 0.0
            best_track_idx = -1

            # Buscar mejor match con IoU + misma clase
            for idx, track in enumerate(self.tracks):
                if track.class_id != det.class_id:
                    continue

                if track.track_id in matched_track_ids:
                    continue

                iou = iou_xyxy(track.bbox, det.bbox)
                if iou > best_iou:
                    best_iou = iou
                    best_track_idx = idx

            # Match encontrado
            if best_iou >= self.match_thresh and best_track_idx >= 0:
                track = self.tracks[best_track_idx]
                # Actualizar track
                track.bbox = det.bbox
                track.confidence = det.confidence
                track.last_seen_frame = self.frame_idx
                updated_tracks.append(track)
                matched_track_ids.add(track.track_id)
            else:
                # Crear nuevo track
                new_track = Track(
                    track_id=self.next_id,
                    class_id=det.class_id,
                    class_name=det.class_name,
                    confidence=det.confidence,
                    bbox=det.bbox,
                    last_seen_frame=self.frame_idx,
                )
                self.next_id += 1
                updated_tracks.append(new_track)

        # Mantener tracks no matcheados pero todavía vivos
        for track in self.tracks:
            if track.track_id not in matched_track_ids:
                if (self.frame_idx - track.last_seen_frame) <= self.max_age:
                    updated_tracks.append(track)

        self.tracks = updated_tracks
        return self.tracks.copy()

    def reset(self):
        """Resetea el tracker (para nueva sesión)"""
        self.tracks = []
        self.frame_idx = 0
        logger.info("Tracker reseteado")
