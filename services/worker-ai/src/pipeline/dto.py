"""Data Transfer Objects para el pipeline de procesamiento"""
from dataclasses import dataclass
from typing import Optional, List, Tuple
import numpy as np


@dataclass
class InitRequest:
    """Solicitud de inicialización del modelo"""
    model_path: str


@dataclass
class FramePayload:
    """Payload de un frame a procesar"""
    session_id: Optional[str]
    frame_id: int
    codec: int
    pixel_format: int
    width: int
    height: int
    data: bytes


@dataclass
class Detection:
    """Una detección individual"""
    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float
    class_name: str
    track_id: Optional[str] = None


@dataclass
class FrameResult:
    """Resultado del procesamiento de un frame"""
    frame_id: int
    session_id: str
    detections: List[Detection]
    frame_width: int
    frame_height: int
    tracking_active: bool
