"""BoT-SORT Tracker - IoU-based tracking with Kalman Filter"""

from dataclasses import dataclass
from typing import List, Dict, Tuple, Optional
import yaml

from ..core.logger import setup_logger
from ..inference.yolo11 import Detection
from .kalman_bbox import KalmanBBoxFilter

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
    """Un track activo con Kalman Filter para suavizado"""

    track_id: int
    class_id: int
    class_name: str
    confidence: float
    bbox: Tuple[float, float, float, float]  # xyxy normalizado (detección raw)
    last_seen_frame: int
    
    # Kalman Filter state
    kf: Optional[KalmanBBoxFilter] = None
    bbox_pred: Optional[Tuple[float, float, float, float]] = None  # predicción KF
    bbox_smooth: Optional[Tuple[float, float, float, float]] = None  # bbox suavizado
    velocity: Optional[Tuple[float, float]] = None  # (vx, vy)
    
    # Track metadata
    age: int = 0  # frames desde creación
    hits: int = 0  # total detections matched
    hit_streak: int = 0  # consecutive frames with detection
    time_since_update: int = 0  # frames desde última detección
    state: str = 'tentative'  # 'tentative', 'confirmed', 'deleted'


class BoTSORTTracker:
    """
    Tracker basado en IoU + class matching con Kalman Filter opcional.
    Compatible con formato de configuración BoT-SORT.
    """

    def __init__(
        self,
        config_path: str = "botsort.yaml",
        use_kalman: bool = True,
        min_hits: int = 3,
    ):
        """
        Args:
            config_path: Ruta al archivo YAML de configuración
            use_kalman: Si True, usa Kalman Filter para suavizado
            min_hits: Hits mínimos para confirmar un track
        """
        # Defaults
        self.match_thresh = 0.3  # IoU mínimo para match
        self.max_age = 30  # Frames máximos sin detección antes de borrar
        self.use_kalman = use_kalman
        self.min_hits = min_hits

        # Cargar config
        try:
            with open(config_path, "r") as f:
                cfg = yaml.safe_load(f) or {}
            self.match_thresh = float(cfg.get("match_thresh", self.match_thresh))
            self.max_age = int(cfg.get("max_age", self.max_age))
            self.min_hits = int(cfg.get("min_hits", self.min_hits))
            logger.info(
                f"Tracker config: match_thresh={self.match_thresh}, "
                f"max_age={self.max_age}, min_hits={self.min_hits}, "
                f"kalman={'enabled' if self.use_kalman else 'disabled'}"
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

        # Fase 1: Predicción para todos los tracks existentes
        if self.use_kalman:
            for track in self.tracks:
                if track.kf is not None:
                    track.bbox_pred = track.kf.predict()
                    track.velocity = track.kf.get_velocity()
                    track.age = track.kf.age
                    track.time_since_update = track.kf.time_since_update

        if not detections:
            # Mantener tracks vivos (sin update)
            self.tracks = [
                t
                for t in self.tracks
                if (self.frame_idx - t.last_seen_frame) <= self.max_age
            ]
            # Actualizar estado de tracks sin match
            for track in self.tracks:
                track.hit_streak = 0
                if track.time_since_update > self.max_age // 3:
                    track.state = 'tentative'
            return self.tracks.copy()

        matched_track_ids = set()
        updated_tracks = []

        # Fase 2: Asociar detecciones con tracks existentes
        for det in detections:
            best_iou = 0.0
            best_track_idx = -1

            # Buscar mejor match con IoU + misma clase
            # Usar bbox_pred si está disponible, sino bbox raw
            for idx, track in enumerate(self.tracks):
                if track.class_id != det.class_id:
                    continue

                if track.track_id in matched_track_ids:
                    continue

                # Usar predicción de Kalman si está disponible
                compare_bbox = track.bbox_pred if track.bbox_pred else track.bbox
                iou = iou_xyxy(compare_bbox, det.bbox)
                
                if iou > best_iou:
                    best_iou = iou
                    best_track_idx = idx

            # Match encontrado
            if best_iou >= self.match_thresh and best_track_idx >= 0:
                track = self.tracks[best_track_idx]
                
                # Actualizar con Kalman Filter
                if self.use_kalman:
                    if track.kf is None:
                        # Inicializar KF si no existe
                        track.kf = KalmanBBoxFilter(det.bbox)
                    
                    # Update KF con nueva medición
                    track.bbox_smooth = track.kf.update(det.bbox)
                    track.velocity = track.kf.get_velocity()
                    track.hits = track.kf.hits
                    track.hit_streak = track.kf.hit_streak
                    track.time_since_update = track.kf.time_since_update
                    
                    # Confirmar track si tiene suficientes hits
                    if track.hits >= self.min_hits:
                        track.state = 'confirmed'
                else:
                    # Sin Kalman, usar bbox directamente
                    track.bbox_smooth = det.bbox
                    track.hits += 1
                    track.hit_streak += 1
                    track.time_since_update = 0
                    if track.hits >= self.min_hits:
                        track.state = 'confirmed'
                
                # Actualizar datos básicos
                track.bbox = det.bbox  # bbox raw siempre viene de YOLO
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
                    state='tentative',
                    hits=1,
                    hit_streak=1,
                    time_since_update=0,
                )
                
                # Inicializar Kalman Filter
                if self.use_kalman:
                    new_track.kf = KalmanBBoxFilter(det.bbox)
                    new_track.bbox_smooth = det.bbox
                    new_track.bbox_pred = det.bbox
                    new_track.velocity = (0.0, 0.0)
                else:
                    new_track.bbox_smooth = det.bbox
                
                self.next_id += 1
                updated_tracks.append(new_track)

        # Fase 3: Mantener tracks no matcheados pero todavía vivos
        for track in self.tracks:
            if track.track_id not in matched_track_ids:
                if (self.frame_idx - track.last_seen_frame) <= self.max_age:
                    track.hit_streak = 0
                    # Degradar estado si lleva mucho sin update
                    if track.time_since_update > self.max_age // 3:
                        track.state = 'tentative'
                    updated_tracks.append(track)

        self.tracks = updated_tracks
        return self.tracks.copy()

    def reset(self):
        """Resetea el tracker (para nueva sesión)"""
        self.tracks = []
        self.frame_idx = 0
        self.next_id = 1
        logger.info("Tracker reseteado")
