"""Procesador de pipeline - Orquesta decode → inferencia → tracking → persistencia"""
from typing import Optional, List
import numpy as np

from ..core.logger import setup_logger
from .dto import FramePayload, FrameResult, Detection
from .frame_decoder import FrameDecoder
from .model_manager import ModelManager
from .tracking_service import TrackingService
from .session_service import SessionService

logger = setup_logger("pipeline.processor")


class FrameProcessor:
    """Orquesta el procesamiento completo de frames"""
    
    def __init__(
        self,
        decoder: FrameDecoder,
        model_manager: ModelManager,
        tracking_service: TrackingService,
        session_service: SessionService,
        class_filter_ids: Optional[List[int]] = None
    ):
        """
        Args:
            decoder: Decodificador de frames
            model_manager: Gestor de modelos
            tracking_service: Servicio de tracking
            session_service: Servicio de sesiones
            class_filter_ids: Lista de IDs de clases a filtrar
        """
        self.decoder = decoder
        self.model_manager = model_manager
        self.tracking_service = tracking_service
        self.session_service = session_service
        self.class_filter_ids = class_filter_ids
        
        self.current_model_path: Optional[str] = None
        self.frame_idx = 0
    
    def process_frame(self, payload: FramePayload) -> Optional[FrameResult]:
        """
        Procesa un frame completo: decode → inferencia → tracking → persistencia
        
        Args:
            payload: Datos del frame a procesar
            
        Returns:
            FrameResult con detecciones o None si hay error
        """
        # 1. Gestionar sesión
        session_changed = self._manage_session(payload.session_id)
        
        # 2. Decodificar frame
        img = self.decoder.decode(
            payload.data,
            payload.codec,
            payload.pixel_format,
            payload.width,
            payload.height
        )
        
        if img is None:
            logger.error("Fallo en decodificación de frame")
            return None
        
        img_h, img_w = img.shape[:2]
        
        # 3. Inferencia
        if self.current_model_path is None:
            logger.error("No hay modelo cargado para inferencia")
            return None
        
        try:
            detections = self.model_manager.infer(
                self.current_model_path,
                img,
                classes_filter=self.class_filter_ids
            )
            
            # Log informativo cuando hay detecciones
            if detections:
                logger.info(f"Detecciones: {len(detections)} objetos - {', '.join(set(d.class_name for d in detections))}")
            
        except Exception as e:
            logger.error(f"Error en inferencia: {e}")
            return None
        
        # 4. Tracking (solo si hay sesión activa)
        tracking_active = (
            self.tracking_service.enabled and 
            self.session_service.is_active()
        )
        
        if tracking_active:
            tracks = self.tracking_service.update(detections)
        else:
            tracks = []
        
        # 5. Persistencia (solo si hay tracks)
        if tracking_active and tracks:
            self.session_service.append(
                tracks,
                payload.frame_id,  # Usar frame_id del video, no contador interno
                frame_width=img_w,
                frame_height=img_h
            )
        
        # 6. Construir resultado
        result_detections = []
        
        if tracking_active:
            # Usar tracks
            for track in tracks:
                x1, y1, x2, y2 = track.bbox
                result_detections.append(Detection(
                    x1=x1,
                    y1=y1,
                    x2=x2,
                    y2=y2,
                    confidence=track.confidence,
                    class_name=track.class_name,
                    track_id=str(track.track_id)
                ))
        else:
            # Usar detecciones directas
            for idx, det in enumerate(detections):
                x1, y1, x2, y2 = det.bbox
                result_detections.append(Detection(
                    x1=x1,
                    y1=y1,
                    x2=x2,
                    y2=y2,
                    confidence=det.confidence,
                    class_name=det.class_name,
                    track_id=f"det-{payload.frame_id}-{idx}"
                ))
        
        self.frame_idx += 1
        
        return FrameResult(
            frame_id=payload.frame_id,
            session_id=payload.session_id or "",
            detections=result_detections,
            frame_width=img_w,
            frame_height=img_h,
            tracking_active=tracking_active
        )
    
    def _manage_session(self, session_id: Optional[str]) -> bool:
        """
        Gestiona el estado de la sesión
        
        Args:
            session_id: ID de sesión del frame (puede ser None)
            
        Returns:
            True si cambió la sesión, False en caso contrario
        """
        # Normalizar session_id
        trimmed_session = (session_id or "").strip()
        normalized_session = trimmed_session if trimmed_session else None
        
        # Si no hay session_id, cerrar sesión activa
        if normalized_session is None:
            if self.session_service.is_active():
                logger.info("Session ID vacío, finalizando sesión activa")
                self.session_service.end()
                self.tracking_service.reset()
                self.frame_idx = 0
                return True
            return False
        
        # Si cambió la sesión, cerrar la anterior
        current = self.session_service.get_current_session_id()
        if current and current != normalized_session:
            logger.info(f"Cambio de sesión: {current} → {normalized_session}")
            self.session_service.end()
            self.tracking_service.reset()
            self.frame_idx = 0
        
        # Si no hay sesión activa y no es una recién cerrada, iniciar nueva
        if not self.session_service.is_active():
            if not self.session_service.was_recently_closed(normalized_session):
                success = self.session_service.start(normalized_session)
                if success:
                    self.frame_idx = 0
                    return True
                else:
                    logger.error(f"No se pudo iniciar sesión: {normalized_session}")
            else:
                logger.debug(f"Frame para sesión recién cerrada: {normalized_session}")
        
        return False
    
    def set_model(self, model_path: str):
        """
        Establece el modelo activo para inferencia
        
        Args:
            model_path: Ruta al modelo
        """
        self.current_model_path = model_path
        logger.info(f"Modelo activo establecido: {model_path}")
    
    def end_session(self):
        """Finaliza la sesión activa"""
        if self.session_service.is_active():
            self.session_service.end()
            self.tracking_service.reset()
            self.frame_idx = 0
    
    def get_image_for_visualization(self, payload: FramePayload) -> Optional[np.ndarray]:
        """
        Decodifica un frame para visualización
        
        Args:
            payload: Datos del frame
            
        Returns:
            Imagen BGR o None si falla
        """
        return self.decoder.decode(
            payload.data,
            payload.codec,
            payload.pixel_format,
            payload.width,
            payload.height
        )
