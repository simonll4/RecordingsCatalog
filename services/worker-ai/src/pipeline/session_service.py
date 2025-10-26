"""Servicio de sesiones - Fachada sobre SessionManager"""
from typing import Optional, List
from pathlib import Path

from ..core.logger import setup_logger
from ..session.manager import SessionManager, SessionWriter
from ..tracking.botsort import Track

logger = setup_logger("pipeline.session")


class SessionService:
    """Fachada sobre SessionManager con API simplificada"""
    
    def __init__(
        self,
        output_dir: str,
        default_fps: float = 10.0,
        segment_duration_s: float = 10.0
    ):
        """
        Args:
            output_dir: Directorio de salida para sesiones
            default_fps: FPS por defecto
            segment_duration_s: Duración de segmentos en segundos
        """
        self.manager = SessionManager(
            output_dir=output_dir,
            default_fps=default_fps,
            segment_duration_s=segment_duration_s
        )
        self.current_session_id: Optional[str] = None
        self.current_writer: Optional[SessionWriter] = None
        self.last_closed_session_id: Optional[str] = None
    
    def start(self, session_id: str, fps: Optional[float] = None) -> bool:
        """
        Inicia una nueva sesión
        
        Args:
            session_id: ID de la sesión
            fps: FPS de la sesión (usa default si es None)
            
        Returns:
            True si se inició correctamente, False si hubo error
        """
        try:
            # Normalizar session_id
            normalized_id = SessionManager.normalize_session_id(session_id)
            
            # Si ya hay una sesión activa diferente, cerrarla
            if self.current_session_id and self.current_session_id != normalized_id:
                self.end()
            
            # Si es la misma sesión, no hacer nada
            if self.current_session_id == normalized_id:
                logger.debug(f"Sesión ya activa: {normalized_id}")
                return True
            
            # Iniciar nueva sesión
            writer = self.manager.start_session(normalized_id, fps)
            self.current_session_id = normalized_id
            self.current_writer = writer
            self.last_closed_session_id = None
            
            logger.info(f"Sesión iniciada: {normalized_id}")
            return True
            
        except ValueError as e:
            logger.error(f"Error iniciando sesión '{session_id}': {e}")
            return False
    
    def append(
        self,
        tracks: List[Track],
        frame_idx: int,
        frame_width: Optional[int] = None,
        frame_height: Optional[int] = None,
        ts_mono_ns: Optional[int] = None,
        ts_utc_ns: Optional[int] = None,
    ):
        """
        Agrega tracks de un frame a la sesión activa
        
        Args:
            tracks: Lista de tracks del frame
            frame_idx: Índice del frame
            frame_width: Ancho del frame
            frame_height: Alto del frame
            ts_mono_ns: Timestamp monotónico (nanosegundos) reportado por el edge-agent
            ts_utc_ns: Timestamp UTC (nanosegundos) reportado por el edge-agent
        """
        if not self.current_writer:
            logger.warning("No hay sesión activa para escribir tracks")
            return
        
        if not tracks:
            return
        
        self.current_writer.write_frame(
            tracks,
            frame_idx,
            frame_width=frame_width,
            frame_height=frame_height,
            ts_mono_ns=ts_mono_ns,
            ts_utc_ns=ts_utc_ns,
        )
    
    def end(self):
        """Finaliza la sesión activa"""
        if self.current_session_id:
            try:
                self.manager.end_session(self.current_session_id)
                logger.info(f"Sesión finalizada: {self.current_session_id}")
                self.last_closed_session_id = self.current_session_id
            except Exception as e:
                logger.error(f"Error finalizando sesión {self.current_session_id}: {e}")
        
        self.current_session_id = None
        self.current_writer = None
    
    def is_active(self) -> bool:
        """Verifica si hay una sesión activa"""
        return self.current_session_id is not None
    
    def get_current_session_id(self) -> Optional[str]:
        """Retorna el ID de la sesión activa"""
        return self.current_session_id
    
    def was_recently_closed(self, session_id: str) -> bool:
        """Verifica si una sesión fue cerrada recientemente"""
        return session_id == self.last_closed_session_id
    
    def end_all(self):
        """Finaliza todas las sesiones activas"""
        self.manager.end_all_sessions()
        self.current_session_id = None
        self.current_writer = None
