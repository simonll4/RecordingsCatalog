"""Configuración runtime derivada del TOML con settings de protocolo"""

from dataclasses import dataclass
from typing import Optional

import ai_pb2 as pb

from .base import Config


@dataclass
class InitOkConfig:
    """Configuración para respuesta InitOk"""

    max_frame_bytes: int = 10 * 1024 * 1024  # 10MB
    initial_credits: int = 4
    pixel_format: int = pb.PF_NV12
    codec: int = pb.CODEC_JPEG
    width: int = 640
    height: int = 640
    fps_target: float = 5.0
    policy: int = pb.LATEST_WINS


@dataclass
class RuntimeConfig:
    """Configuración runtime completa del worker"""

    # Config base del TOML
    base_config: Config

    # Settings de protocolo
    init_ok: InitOkConfig

    # Límites
    max_frame_size: int = 50 * 1024 * 1024  # 50MB

    @classmethod
    def from_toml(cls, toml_path: str = "config.toml") -> "RuntimeConfig":
        """
        Carga configuración desde TOML y construye RuntimeConfig

        Args:
            toml_path: Ruta al archivo TOML

        Returns:
            RuntimeConfig completo
        """
        base = Config.load(toml_path)

        # Configurar InitOk según el TOML
        init_ok = InitOkConfig()

        return cls(base_config=base, init_ok=init_ok, max_frame_size=50 * 1024 * 1024)
