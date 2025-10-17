"""Configuración del worker"""
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

import tomli


@dataclass
class ServerConfig:
    """Configuración del servidor TCP"""

    bind_host: str = "0.0.0.0"
    bind_port: int = 7001
    idle_timeout_sec: int = 60


@dataclass
class ModelConfig:
    """Configuración del modelo de inferencia"""

    conf_threshold: float = 0.5
    nms_iou: float = 0.6
    classes: List[str] = field(default_factory=list)


@dataclass
class TrackerConfig:
    """Configuración del tracker"""

    enabled: bool = True
    type: str = "botsort"
    config_path: str = "botsort.yaml"


@dataclass
class SessionConfig:
    """Configuración de sesiones"""

    output_dir: str = "./data/tracks"
    default_fps: float = 10.0
    segment_duration_s: float = 10.0


@dataclass
class VisualizationConfig:
    """Configuración de visualización"""

    enabled: bool = True
    window_name: str = "AI Worker - Detections"


@dataclass
class Config:
    """Configuración completa del worker"""

    server: ServerConfig
    model: ModelConfig
    tracker: TrackerConfig
    sessions: SessionConfig
    visualization: VisualizationConfig

    @classmethod
    def load(cls, config_path: str = "config.toml") -> "Config":
        """Carga configuración desde archivo TOML"""
        path = Path(config_path)

        # Buscar config.local.toml primero
        local_path = path.parent / "config.local.toml"
        if local_path.exists():
            path = local_path
            print(f"📝 Usando {local_path.name} (desarrollo local)")

        with open(path, "rb") as f:
            data = tomli.load(f)

        sessions_data = data.get("sessions", {})
        output_dir_raw = sessions_data.get("output_dir", SessionConfig.output_dir)
        output_dir_path = Path(output_dir_raw)
        if not output_dir_path.is_absolute():
            output_dir_path = (path.parent / output_dir_path).resolve()
        sessions_data = {
            **sessions_data,
            "output_dir": str(output_dir_path),
        }

        return cls(
            server=ServerConfig(**data.get("server", {})),
            model=ModelConfig(**data.get("model", {})),
            tracker=TrackerConfig(**data.get("tracker", {})),
            sessions=SessionConfig(**sessions_data),
            visualization=VisualizationConfig(**data.get("visualization", {})),
        )
