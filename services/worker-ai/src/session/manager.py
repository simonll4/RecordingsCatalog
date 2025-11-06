"""Gestión de sesiones de tracking con persistencia segmentada en JSON"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from ..core.logger import setup_logger
from ..tracking.botsort import Track

logger = setup_logger("session")


def _isoformat_utc(dt: datetime) -> str:
    """Formatea fecha en ISO8601 con sufijo Z."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _utcnow_iso() -> str:
    """Devuelve fecha/hora actual en UTC en formato ISO8601."""
    return _isoformat_utc(datetime.now(timezone.utc))


def _ns_to_iso(ts_ns: int) -> str:
    """Convierte un timestamp en nanosegundos UTC a ISO8601."""
    seconds = ts_ns / 1_000_000_000
    dt = datetime.fromtimestamp(seconds, tz=timezone.utc)
    return _isoformat_utc(dt)


def _atomic_json_dump(path: Path, payload: dict) -> None:
    """Escribe JSON en disco usando rename atómico."""
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(tmp_path, "w", encoding="utf-8") as tmp_file:
        json.dump(payload, tmp_file, indent=2)
    tmp_path.replace(path)


@dataclass
class SessionMeta:
    """Metadata persistida por sesión."""

    session_id: str
    device_id: str
    start_time: str
    end_time: Optional[str]
    frame_count: int
    fps: float
    path: Optional[str] = None
    video: Dict[str, Optional[float | str]] = field(default_factory=dict)
    classes: List[Dict[str, str | int]] = field(default_factory=list)


class SessionWriter:
    """Gestiona archivos de tracking para una sesión."""

    def __init__(
        self,
        session_id: str,
        output_dir: Path,
        fps: float = 10.0,
        segment_duration_s: float = 10.0,
    ):
        self.session_id = session_id
        self.fps = max(fps, 0.0001)
        self.segment_duration_s = max(segment_duration_s, 0.1)

        self.session_dir = output_dir / session_id
        self.segments_dir = self.session_dir / "tracks"
        self.session_dir.mkdir(parents=True, exist_ok=True)
        self.segments_dir.mkdir(parents=True, exist_ok=True)

        self.index_file = self.session_dir / "index.json"
        self.meta_file = self.session_dir / "meta.json"

        self.current_segment_fp = None
        self.current_segment_index: Optional[int] = None

        self.segment_info: Dict[int, Dict[str, object]] = {}
        self.classes_seen: Dict[int, str] = {}

        self.frame_count = 0
        self.latest_frame_idx = -1
        self.start_time = _utcnow_iso()
        self.end_time: Optional[str] = None

        self.session_start_mono_ns: Optional[int] = None
        self.session_start_utc_ns: Optional[int] = None
        self.latest_mono_ns: Optional[int] = None
        self.latest_utc_ns: Optional[int] = None

        self.video_width: Optional[int] = None
        self.video_height: Optional[int] = None

        self.device_id = session_id.split("_", 2)[1] if "_" in session_id else "unknown"

        logger.info(
            "Sesión iniciada: %s -> %s (segmento=%.1fs)",
            session_id,
            self.session_dir,
            self.segment_duration_s,
        )

        # Inicializar archivos con placeholders
        self._write_meta()
        self._write_index()

    # --------------------------------------------------------------------- #
    # API pública
    # --------------------------------------------------------------------- #
    def write_frame(
        self,
        tracks: List[Track],
        frame_idx: int,  # IMPORTANTE: Debe ser el frame_id real del video, no un contador interno
        frame_width: Optional[int] = None,
        frame_height: Optional[int] = None,
        ts_mono_ns: Optional[int] = None,
        ts_utc_ns: Optional[int] = None,
    ) -> None:
        """Persiste tracks de un frame dentro del segmento correspondiente.

        Args:
            tracks: Lista de tracks detectados
            frame_idx: ID del frame en el video (debe venir de payload.frame_id)
            frame_width: Ancho del frame (opcional)
            frame_height: Alto del frame (opcional)
            ts_mono_ns: Timestamp monotónico (nanosegundos) reportado por el edge-agent
            ts_utc_ns: Timestamp UTC (nanosegundos) reportado por el edge-agent
        """
        if not tracks:
            return

        # Registrar timestamps base al recibir el primer frame
        if ts_mono_ns is not None and self.session_start_mono_ns is None:
            self.session_start_mono_ns = ts_mono_ns
        if ts_utc_ns is not None and self.session_start_utc_ns is None:
            self.session_start_utc_ns = ts_utc_ns
            self.start_time = _ns_to_iso(ts_utc_ns)

        if ts_mono_ns is not None:
            self.latest_mono_ns = ts_mono_ns
        if ts_utc_ns is not None:
            self.latest_utc_ns = ts_utc_ns

        # Calcular timestamp relativo preferentemente usando los nanosegundos reportados
        t_rel_s: Optional[float] = None
        if ts_mono_ns is not None and self.session_start_mono_ns is not None:
            t_rel_s = (ts_mono_ns - self.session_start_mono_ns) / 1_000_000_000
        elif ts_utc_ns is not None and self.session_start_utc_ns is not None:
            t_rel_s = (ts_utc_ns - self.session_start_utc_ns) / 1_000_000_000

        if t_rel_s is None:
            # Fallback al comportamiento previo si no tenemos timestamps
            t_rel_s = frame_idx / self.fps if self.fps > 0 else 0.0

        # Evitar valores negativos en caso de timestamps fuera de orden
        if t_rel_s < 0:
            logger.debug(
                "Timestamp relativo negativo detectado para frame %d (t_rel_s=%f). "
                "Usando 0 como base.",
                frame_idx,
                t_rel_s,
            )
            t_rel_s = 0.0

        segment_index = int(t_rel_s // self.segment_duration_s)
        segment = self._ensure_segment(segment_index)

        self.frame_count += 1
        self.latest_frame_idx = max(self.latest_frame_idx, frame_idx)

        if frame_width:
            self.video_width = frame_width
        if frame_height:
            self.video_height = frame_height

        objs = []
        for track in tracks:
            self.classes_seen[track.class_id] = track.class_name
            x1, y1, x2, y2 = track.bbox
            
            # Base object (v1 - backward compatible)
            obj = {
                "track_id": track.track_id,
                "cls": track.class_id,
                "cls_name": track.class_name,
                "conf": round(track.confidence, 4),
                "bbox_xyxy": [
                    round(x1, 4),
                    round(y1, 4),
                    round(x2, 4),
                    round(y2, 4),
                ],
            }
            
            # Extended metadata (v2 - optional)
            # Solo agregar si hay datos de Kalman Filter
            if track.kf is not None:
                kf_state = {}
                
                # Bbox suavizado
                if track.bbox_smooth:
                    sx1, sy1, sx2, sy2 = track.bbox_smooth
                    kf_state["bbox_smooth"] = [
                        round(sx1, 4),
                        round(sy1, 4),
                        round(sx2, 4),
                        round(sy2, 4),
                    ]
                
                # Bbox predicho
                if track.bbox_pred:
                    px1, py1, px2, py2 = track.bbox_pred
                    kf_state["bbox_pred"] = [
                        round(px1, 4),
                        round(py1, 4),
                        round(px2, 4),
                        round(py2, 4),
                    ]
                
                # Velocidad
                if track.velocity:
                    vx, vy = track.velocity
                    kf_state["velocity"] = [round(vx, 4), round(vy, 4)]
                
                if kf_state:
                    obj["kf_state"] = kf_state
            
            # Track metadata
            if track.age > 0 or track.hits > 0:
                obj["track_meta"] = {
                    "age": track.age,
                    "hits": track.hits,
                    "hit_streak": track.hit_streak,
                    "time_since_update": track.time_since_update,
                    "state": track.state,
                }
            
            objs.append(obj)

        event = {
            "t_rel_s": round(t_rel_s, 3),
            "frame": frame_idx,
            "ts_mono_ns": ts_mono_ns,
            "ts_utc_ns": ts_utc_ns,
            "objs": objs,
        }

        if self.current_segment_fp is None:
            raise RuntimeError("Segmento activo no inicializado antes de escribir")

        self.current_segment_fp.write(json.dumps(event, ensure_ascii=True) + "\n")
        self.current_segment_fp.flush()

        segment["count"] = int(segment.get("count", 0)) + 1

        self._write_index()
        self._write_meta()

    def finalize(self) -> None:
        """Cierra archivos y escribe metadata final."""
        if self.latest_utc_ns is not None:
            self.end_time = _ns_to_iso(self.latest_utc_ns)
        else:
            self.end_time = _utcnow_iso()
        self._close_current_segment(mark_closed=True)

        self._write_index()
        self._write_meta()

        logger.info(
            "Sesión finalizada: %s (%d frames con tracks)",
            self.session_id,
            self.frame_count,
        )

    # --------------------------------------------------------------------- #
    # Helpers internos
    # --------------------------------------------------------------------- #
    def _ensure_segment(self, index: int) -> Dict[str, object]:
        """Abre (o reutiliza) el archivo del segmento indicado."""
        if self.current_segment_index == index and self.current_segment_fp:
            return self.segment_info[index]

        # Cerrar segmento actual antes de avanzar
        self._close_current_segment(mark_closed=True)

        segment = self.segment_info.get(index)
        if segment is None:
            t0 = index * self.segment_duration_s
            t1 = (index + 1) * self.segment_duration_s
            segment = {
                "i": index,
                "t0": round(t0, 3),
                "t1": round(t1, 3),
                "url": f"tracks/seg-{index:04d}.jsonl",
                "count": 0,
                "closed": False,
            }
            self.segment_info[index] = segment

        segment["closed"] = False

        file_path = self.segments_dir / f"seg-{index:04d}.jsonl"
        self.current_segment_fp = open(file_path, "a", encoding="utf-8")
        self.current_segment_index = index

        return segment

    def _close_current_segment(self, mark_closed: bool) -> None:
        """Cierra el archivo del segmento activo."""
        if self.current_segment_fp:
            self.current_segment_fp.flush()
            self.current_segment_fp.close()

        if mark_closed and self.current_segment_index is not None:
            segment = self.segment_info.get(self.current_segment_index)
            if segment:
                segment["closed"] = True

        self.current_segment_fp = None
        self.current_segment_index = None

    def _write_index(self) -> None:
        """Genera index.json con los segmentos conocidos."""
        segments_dicts = [
            {
                "i": seg["i"],
                "t0": seg["t0"],
                "t1": seg["t1"],
                "url": seg["url"],
                "count": seg["count"],
                "closed": seg["closed"],
            }
            for seg in sorted(
                self.segment_info.values(), key=lambda item: int(item["i"])
            )
        ]

        duration_s = 0.0
        if (
            self.session_start_mono_ns is not None
            and self.latest_mono_ns is not None
            and self.latest_mono_ns >= self.session_start_mono_ns
        ):
            duration_s = round(
                (self.latest_mono_ns - self.session_start_mono_ns) / 1_000_000_000, 3
            )
        elif self.latest_frame_idx >= 0 and self.fps > 0:
            duration_s = round((self.latest_frame_idx + 1) / self.fps, 3)

        payload = {
            "segment_duration_s": self.segment_duration_s,
            "segments": segments_dicts,
            "fps": self.fps,
            "duration_s": duration_s,
        }

        _atomic_json_dump(self.index_file, payload)

    def _write_meta(self) -> None:
        """Actualiza meta.json con datos de la sesión."""
        video_info: Dict[str, Optional[float | str]] = {
            "width": self.video_width,
            "height": self.video_height,
            "fps": self.fps,
        }
        if self.session_start_utc_ns is not None:
            video_info["start_ts_utc_ns"] = str(self.session_start_utc_ns)
        if self.latest_utc_ns is not None:
            video_info["end_ts_utc_ns"] = str(self.latest_utc_ns)

        classes = [
            {"id": cid, "name": name}
            for cid, name in sorted(self.classes_seen.items(), key=lambda item: item[0])
        ]

        meta = SessionMeta(
            session_id=self.session_id,
            device_id=self.device_id,
            start_time=self.start_time,
            end_time=self.end_time,
            frame_count=self.frame_count,
            fps=self.fps,
            video=video_info,
            classes=classes,
        )

        _atomic_json_dump(self.meta_file, asdict(meta))


class SessionManager:
    """Administra sesiones activas del worker."""

    def __init__(
        self,
        output_dir: str,
        default_fps: float = 10.0,
        segment_duration_s: float = 10.0,
    ):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        self.default_fps = default_fps
        self.segment_duration_s = segment_duration_s

        self.active_sessions: Dict[str, SessionWriter] = {}

        logger.info(
            "SessionManager inicializado: %s (segment=%.1fs)",
            self.output_dir,
            self.segment_duration_s,
        )

    @staticmethod
    def normalize_session_id(session_id: str) -> str:
        """Normaliza/valida session_id recibido desde el edge-agent."""
        normalized = (session_id or "").strip()
        if not normalized:
            raise ValueError("session_id vacío o inválido")
        if normalized in {".", ".."} or "/" in normalized or "\\" in normalized:
            raise ValueError(f"session_id inválido: {normalized}")
        return normalized

    def start_session(
        self, session_id: str, fps: Optional[float] = None
    ) -> SessionWriter:
        """Abre una nueva sesión (cerrando la previa si estaba activa)."""
        session_id = self.normalize_session_id(session_id)

        if session_id in self.active_sessions:
            logger.warning(
                "Sesión %s ya existía, cerrando instancia previa", session_id
            )
            self.end_session(session_id)

        effective_fps = fps or self.default_fps
        writer = SessionWriter(
            session_id,
            self.output_dir,
            fps=effective_fps,
            segment_duration_s=self.segment_duration_s,
        )

        self.active_sessions[session_id] = writer
        return writer

    def end_session(self, session_id: str) -> None:
        """Finaliza los archivos asociados a una sesión."""
        writer = self.active_sessions.pop(session_id, None)
        if writer:
            writer.finalize()

    def end_all_sessions(self) -> None:
        """Cierra todas las sesiones activas (shutdown ordenado)."""
        for session_id in list(self.active_sessions.keys()):
            self.end_session(session_id)
