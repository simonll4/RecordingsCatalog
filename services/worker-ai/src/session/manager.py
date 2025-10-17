"""Gestión de sesiones de tracking con persistencia a JSON"""
import json
from pathlib import Path
from typing import List, Dict, Any
from dataclasses import dataclass, asdict
from datetime import datetime

from ..core.logger import setup_logger
from ..tracking.botsort import Track

logger = setup_logger("session")


@dataclass
class SessionMeta:
    """Metadata de una sesión"""
    session_id: str
    device_id: str
    start_time: str
    end_time: str | None
    frame_count: int
    fps: float


class SessionWriter:
    """Escribe tracks de una sesión a disco"""
    
    def __init__(self, session_id: str, output_dir: Path, fps: float = 10.0):
        """
        Args:
            session_id: ID único de la sesión
            output_dir: Directorio base para guardar
            fps: FPS de la sesión para calcular timestamps
        """
        self.session_id = session_id
        self.fps = fps
        self.frame_count = 0
        
        # Crear directorio de sesión
        self.session_dir = output_dir / session_id
        self.session_dir.mkdir(parents=True, exist_ok=True)
        
        # Archivos
        self.tracks_file = self.session_dir / "tracks.jsonl"
        self.index_file = self.session_dir / "index.json"
        self.meta_file = self.session_dir / "meta.json"
        
        # Abrir archivo de tracks
        self.tracks_fp = open(self.tracks_file, "w")
        
        # Índice para buscar rápido por frame
        self.frame_offsets: Dict[int, int] = {}
        
        # Metadata
        self.start_time = datetime.now().isoformat()
        self.device_id = session_id.split("_")[1] if "_" in session_id else "unknown"
        
        logger.info(f"Sesión iniciada: {session_id} -> {self.session_dir}")
    
    def write_frame(self, tracks: List[Track], frame_idx: int):
        """
        Escribe tracks de un frame
        
        Args:
            tracks: Tracks del frame
            frame_idx: Índice del frame
        """
        # Guardar offset para índice
        offset = self.tracks_fp.tell()
        self.frame_offsets[frame_idx] = offset
        
        # Timestamp en segundos
        timestamp = frame_idx / self.fps
        
        # Convertir tracks a formato JSON
        objs = []
        for track in tracks:
            x1, y1, x2, y2 = track.bbox
            obj = {
                "id": track.track_id,
                "cls": track.class_name,
                "conf": round(track.confidence, 4),  # Confianza 0-1
                "xyxy": [round(x1, 4), round(y1, 4), round(x2, 4), round(y2, 4)]
            }
            objs.append(obj)
        
        # Escribir línea JSONL
        line = {"t": round(timestamp, 3), "objs": objs}
        self.tracks_fp.write(json.dumps(line) + "\n")
        self.tracks_fp.flush()
        
        self.frame_count += 1
    
    def finalize(self):
        """Cierra archivos y escribe index.json y meta.json"""
        # Cerrar tracks
        try:
            if not self.tracks_fp.closed:
                self.tracks_fp.close()
        except AttributeError:
            pass

        # Asegurar que el directorio existe (por si fue eliminado externamente)
        self.session_dir.mkdir(parents=True, exist_ok=True)

        try:
            index_data = {
                "fps": self.fps,
                "duration": self.frame_count / self.fps if self.frame_count > 0 else 0,
                "offsets": {str(k): v for k, v in self.frame_offsets.items()}
            }
            with open(self.index_file, "w") as f:
                json.dump(index_data, f, indent=2)

            meta = SessionMeta(
                session_id=self.session_id,
                device_id=self.device_id,
                start_time=self.start_time,
                end_time=datetime.now().isoformat(),
                frame_count=self.frame_count,
                fps=self.fps
            )
            with open(self.meta_file, "w") as f:
                json.dump(asdict(meta), f, indent=2)

            logger.info(
                f"Sesión finalizada: {self.session_id} "
                f"({self.frame_count} frames, {index_data['duration']:.1f}s)"
            )
        except Exception as exc:
            logger.error(
                f"No se pudo finalizar sesión {self.session_id}: {exc}"
            )


class SessionManager:
    """Administra múltiples sesiones activas"""

    def __init__(self, output_dir: str, default_fps: float = 10.0):
        """
        Args:
            output_dir: Directorio base para guardar sesiones
            default_fps: FPS por defecto si no se especifica
        """
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.default_fps = default_fps
        
        self.active_sessions: Dict[str, SessionWriter] = {}

        logger.info(f"SessionManager inicializado: {self.output_dir}")

    @staticmethod
    def normalize_session_id(session_id: str) -> str:
        """Normaliza y valida un session_id recibido desde el edge-agent"""
        normalized = (session_id or "").strip()

        if not normalized:
            raise ValueError("session_id vacío o inválido")

        if normalized in {".", ".."} or "/" in normalized or "\\" in normalized:
            raise ValueError(f"session_id inválido: {normalized}")

        return normalized

    def start_session(self, session_id: str, fps: float | None = None) -> SessionWriter:
        """
        Inicia una nueva sesión
        
        Args:
            session_id: ID único de la sesión
            fps: FPS de la sesión (usa default_fps si es None)
        
        Returns:
            SessionWriter para escribir tracks
        """
        session_id = self.normalize_session_id(session_id)

        if session_id in self.active_sessions:
            logger.warning(f"Sesión {session_id} ya existe, cerrando anterior")
            self.end_session(session_id)

        fps = fps or self.default_fps
        writer = SessionWriter(session_id, self.output_dir, fps)
        self.active_sessions[session_id] = writer
        
        return writer
    
    def end_session(self, session_id: str):
        """Finaliza una sesión"""
        if session_id in self.active_sessions:
            writer = self.active_sessions.pop(session_id)
            writer.finalize()
    
    def end_all_sessions(self):
        """Finaliza todas las sesiones activas"""
        session_ids = list(self.active_sessions.keys())
        for session_id in session_ids:
            self.end_session(session_id)
        
        if session_ids:
            logger.info(f"Todas las sesiones finalizadas ({len(session_ids)})")
