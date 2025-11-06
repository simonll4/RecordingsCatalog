"""
Kalman Filter para tracking de bounding boxes en 2D.

Implementación ligera usando solo NumPy, sin dependencias externas.
Modela estado como [cx, cy, w, h, vx, vy, vw, vh] donde:
- cx, cy: centro del bbox (normalizado 0-1)
- w, h: ancho y alto (normalizado 0-1)
- vx, vy, vw, vh: velocidades de cada componente
"""

import numpy as np
from typing import Tuple, Optional


class KalmanBBoxFilter:
    """
    Kalman Filter para bounding boxes 2D.
    
    Estado: [cx, cy, w, h, vx, vy, vw, vh]
    - Posición del centro (cx, cy) y dimensiones (w, h) en coords normalizadas
    - Velocidades (vx, vy, vw, vh) para predicción
    """
    
    def __init__(
        self,
        bbox_xyxy: Tuple[float, float, float, float],
        process_noise: float = 1e-2,
        measurement_noise: float = 1e-1,
    ):
        """
        Inicializa el filtro con una detección inicial.
        
        Args:
            bbox_xyxy: Bounding box inicial [x1, y1, x2, y2] normalizado
            process_noise: Covarianza del ruido del proceso (Q)
            measurement_noise: Covarianza del ruido de medición (R)
        """
        # Convertir xyxy a centro + dimensiones
        x1, y1, x2, y2 = bbox_xyxy
        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0
        w = x2 - x1
        h = y2 - y1
        
        # Estado inicial: [cx, cy, w, h, vx, vy, vw, vh]
        self.x = np.array([cx, cy, w, h, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
        
        # Matriz de covarianza (8x8)
        # Inicializar con alta incertidumbre en velocidades
        self.P = np.eye(8, dtype=np.float32)
        self.P[4:, 4:] *= 10.0  # Mayor incertidumbre en velocidades
        
        # Matriz de transición de estado (8x8)
        # x_k+1 = F * x_k
        # Asume dt=1 (un frame)
        self.F = np.eye(8, dtype=np.float32)
        self.F[0, 4] = 1.0  # cx += vx * dt
        self.F[1, 5] = 1.0  # cy += vy * dt
        self.F[2, 6] = 1.0  # w += vw * dt
        self.F[3, 7] = 1.0  # h += vh * dt
        
        # Matriz de observación (4x8)
        # Solo observamos [cx, cy, w, h], no las velocidades
        self.H = np.zeros((4, 8), dtype=np.float32)
        self.H[0, 0] = 1.0
        self.H[1, 1] = 1.0
        self.H[2, 2] = 1.0
        self.H[3, 3] = 1.0
        
        # Covarianza del ruido del proceso (8x8)
        self.Q = np.eye(8, dtype=np.float32) * process_noise
        # Más ruido en velocidades
        self.Q[4:, 4:] *= 2.0
        
        # Covarianza del ruido de medición (4x4)
        self.R = np.eye(4, dtype=np.float32) * measurement_noise
        
        self.age = 0
        self.hits = 0
        self.hit_streak = 0
        self.time_since_update = 0
    
    def predict(self) -> Tuple[float, float, float, float]:
        """
        Predice el siguiente estado sin medición.
        
        Returns:
            Bbox predicho en formato xyxy normalizado
        """
        # Predicción: x_k = F * x_k-1
        self.x = self.F @ self.x
        
        # Predicción covarianza: P_k = F * P_k-1 * F^T + Q
        self.P = self.F @ self.P @ self.F.T + self.Q
        
        self.age += 1
        self.time_since_update += 1
        
        # Convertir estado predicho a xyxy
        return self._state_to_xyxy()
    
    def update(self, bbox_xyxy: Tuple[float, float, float, float]) -> Tuple[float, float, float, float]:
        """
        Actualiza el estado con una nueva medición.
        
        Args:
            bbox_xyxy: Nueva detección [x1, y1, x2, y2] normalizado
            
        Returns:
            Bbox actualizado en formato xyxy normalizado
        """
        # Convertir medición a formato [cx, cy, w, h]
        x1, y1, x2, y2 = bbox_xyxy
        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0
        w = max(1e-6, x2 - x1)
        h = max(1e-6, y2 - y1)
        z = np.array([cx, cy, w, h], dtype=np.float32)
        
        # Innovación: y = z - H * x
        y = z - (self.H @ self.x)
        
        # Covarianza de innovación: S = H * P * H^T + R
        S = self.H @ self.P @ self.H.T + self.R
        
        # Ganancia de Kalman: K = P * H^T * S^-1
        try:
            K = self.P @ self.H.T @ np.linalg.inv(S)
        except np.linalg.LinAlgError:
            # Si S es singular, usar pseudo-inversa
            K = self.P @ self.H.T @ np.linalg.pinv(S)
        
        # Actualización del estado: x = x + K * y
        self.x = self.x + K @ y
        
        # Actualización de covarianza: P = (I - K * H) * P
        I_KH = np.eye(8, dtype=np.float32) - K @ self.H
        self.P = I_KH @ self.P
        
        # Actualizar contadores
        self.hits += 1
        self.hit_streak += 1
        self.time_since_update = 0
        
        return self._state_to_xyxy()
    
    def get_state(self) -> np.ndarray:
        """Retorna el estado completo [cx, cy, w, h, vx, vy, vw, vh]"""
        return self.x.copy()
    
    def get_velocity(self) -> Tuple[float, float]:
        """Retorna la velocidad del centro [vx, vy]"""
        return (float(self.x[4]), float(self.x[5]))
    
    def _state_to_xyxy(self) -> Tuple[float, float, float, float]:
        """Convierte estado interno a bbox xyxy"""
        cx, cy, w, h = self.x[:4]
        
        # Clamp dimensiones a valores positivos
        w = max(1e-6, float(w))
        h = max(1e-6, float(h))
        
        x1 = float(cx - w / 2.0)
        y1 = float(cy - h / 2.0)
        x2 = float(cx + w / 2.0)
        y2 = float(cy + h / 2.0)
        
        # Clamp a [0, 1] para coords normalizadas
        x1 = max(0.0, min(1.0, x1))
        y1 = max(0.0, min(1.0, y1))
        x2 = max(0.0, min(1.0, x2))
        y2 = max(0.0, min(1.0, y2))
        
        return (x1, y1, x2, y2)
