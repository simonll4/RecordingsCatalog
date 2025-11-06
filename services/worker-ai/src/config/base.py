"""Configuración base del worker desde TOML"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional
import json

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
    class_catalog: List[str] = field(default_factory=list)
    class_catalog_path: Optional[str] = None


@dataclass
class TrackerConfig:
    """Configuración del tracker"""

    enabled: bool = True
    type: str = "botsort"
    config_path: str = "botsort.yaml"
    use_kalman: bool = True


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

        model_data = dict(data.get("model", {}))

        def _sanitize_list(raw_list):
            if not isinstance(raw_list, list):
                return []
            sanitized = []
            for item in raw_list:
                if item is None:
                    continue
                text = str(item).strip()
                if text:
                    sanitized.append(text)
            return sanitized

        classes_list = _sanitize_list(model_data.get("classes", []))
        model_data["classes"] = classes_list

        catalog_from_file: List[str] = []
        class_catalog_path_raw = model_data.get("class_catalog_path")
        class_catalog_path: Optional[Path] = None

        if isinstance(class_catalog_path_raw, str) and class_catalog_path_raw.strip():
            potential_path = Path(class_catalog_path_raw.strip())
            if not potential_path.is_absolute():
                potential_path = (path.parent / potential_path).resolve()
            if potential_path.exists():
                class_catalog_path = potential_path
                try:
                    if potential_path.suffix.lower() == ".json":
                        with open(potential_path, "r", encoding="utf-8") as catalog_file:
                            catalog_data = json.load(catalog_file)
                        if isinstance(catalog_data, list):
                            catalog_from_file = _sanitize_list(catalog_data)
                        else:
                            print(
                                f"⚠️  class_catalog_path {potential_path} no contiene una lista JSON válida"
                            )
                    else:
                        with open(potential_path, "r", encoding="utf-8") as catalog_file:
                            catalog_from_file = _sanitize_list(
                                catalog_file.read().splitlines()
                            )
                except Exception as exc:  # pragma: no cover - log informativo
                    print(f"⚠️  No se pudo leer class_catalog_path {potential_path}: {exc}")
            else:
                print(f"⚠️  class_catalog_path no encontrado: {potential_path}")

        catalog_inline = _sanitize_list(model_data.get("class_catalog", []))
        if catalog_from_file:
            class_catalog = catalog_from_file
        else:
            class_catalog = catalog_inline

        model_data["class_catalog"] = class_catalog
        model_data["class_catalog_path"] = (
            str(class_catalog_path) if class_catalog_path is not None else None
        )

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
            model=ModelConfig(**model_data),
            tracker=TrackerConfig(**data.get("tracker", {})),
            sessions=SessionConfig(**sessions_data),
            visualization=VisualizationConfig(**data.get("visualization", {})),
        )
