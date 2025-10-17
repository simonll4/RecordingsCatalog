"""Configuración del worker"""
import tomli
from pathlib import Path
from dataclasses import dataclass


@dataclass
class ServerConfig:
    """Configuración del servidor TCP"""
    bind_host: str = "0.0.0.0"
    bind_port: int = 7001
    idle_timeout_sec: int = 60


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


@dataclass
class VisualizationConfig:
    """Configuración de visualización"""
    enabled: bool = True
    window_name: str = "AI Worker - Detections"


@dataclass
class Config:
    """Configuración completa del worker"""
    server: ServerConfig
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
        
        return cls(
            server=ServerConfig(**data.get("server", {})),
            tracker=TrackerConfig(**data.get("tracker", {})),
            sessions=SessionConfig(**data.get("sessions", {})),
            visualization=VisualizationConfig(**data.get("visualization", {})),
        )
