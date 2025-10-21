"""Visualizador de detecciones y tracking"""
import cv2
import numpy as np
from typing import List

from ..tracking.botsort import Track


# Colores para diferentes clases (BGR)
CLASS_COLORS = {
    "person": (0, 255, 0),      # Verde
    "bicycle": (255, 0, 0),     # Azul
    "car": (0, 0, 255),         # Rojo
    "motorcycle": (255, 255, 0), # Cyan
    "bus": (255, 0, 255),       # Magenta
    "truck": (0, 255, 255),     # Amarillo
}
DEFAULT_COLOR = (128, 128, 128)  # Gris


class Visualizer:
    """Dibuja tracks en frames"""
    
    def __init__(self, window_name: str = "AI Worker - Detections"):
        """
        Args:
            window_name: Nombre de la ventana OpenCV
        """
        self.window_name = window_name
        cv2.namedWindow(self.window_name, cv2.WINDOW_NORMAL)
    
    def draw_tracks(self, frame: np.ndarray, tracks: List[Track]) -> np.ndarray:
        """
        Dibuja tracks en el frame
        
        Args:
            frame: Frame BGR (HxWx3)
            tracks: Lista de tracks activos
        
        Returns:
            Frame con anotaciones dibujadas
        """
        img = frame.copy()
        h, w = img.shape[:2]
        
        for track in tracks:
            # Convertir bbox normalizada a píxeles
            x1n, y1n, x2n, y2n = track.bbox
            
            # Clamp a [0,1] y convertir a píxeles
            x1 = int(max(0.0, min(1.0, x1n)) * w)
            y1 = int(max(0.0, min(1.0, y1n)) * h)
            x2 = int(max(0.0, min(1.0, x2n)) * w)
            y2 = int(max(0.0, min(1.0, y2n)) * h)
            
            # Color por clase
            color = CLASS_COLORS.get(track.class_name, DEFAULT_COLOR)
            
            # Dibujar bbox
            cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
            
            # Label: ID, clase, confianza
            label = f"ID:{track.track_id} {track.class_name} {track.confidence:.2f}"
            
            # Fondo para el texto
            (text_w, text_h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            cv2.rectangle(img, (x1, y1 - text_h - 4), (x1 + text_w, y1), color, -1)
            
            # Texto
            cv2.putText(
                img, label, (x1, y1 - 2),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA
            )
        
        # Info general
        info = f"Tracks: {len(tracks)}"
        cv2.putText(
            img, info, (10, 30),
            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2, cv2.LINE_AA
        )
        
        return img
    
    def show(self, frame: np.ndarray, tracks: List[Track]):
        """
        Dibuja y muestra el frame con tracks
        
        Args:
            frame: Frame BGR
            tracks: Tracks activos
        """
        annotated = self.draw_tracks(frame, tracks)
        cv2.imshow(self.window_name, annotated)
        cv2.waitKey(1)
    
    def close(self):
        """Cierra la ventana"""
        cv2.destroyWindow(self.window_name)
