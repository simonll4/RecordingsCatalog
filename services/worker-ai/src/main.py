#!/usr/bin/env python3
"""Worker AI - Servicio de inferencia y tracking

Servidor TCP que recibe frames del edge-agent, ejecuta YOLO11 para detectar objetos,
aplica tracking BoT-SORT, y persiste los resultados en JSON por sesión.

Arquitectura refactorizada:
- src/transport: Framing TCP y codec Protobuf
- src/pipeline: Procesamiento de frames (decode → inferencia → tracking → persistencia)
- src/server: Servidor TCP y gestión de conexiones
- src/config: Configuración runtime
- src/core: Configuración base y logging
- src/inference: Modelo YOLO11 ONNX
- src/tracking: Tracker BoT-SORT
- src/session: Gestión de sesiones y persistencia
- src/visualization: Visualización con OpenCV
"""
import asyncio
import sys
from pathlib import Path

# Agregar el directorio raíz al path para imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.core.logger import setup_logger
from src.config.runtime import RuntimeConfig
from src.server.server import WorkerServer

logger = setup_logger("worker")


async def main():
    """Función principal - Bootstrap del worker"""
    # Cargar configuración runtime
    config = RuntimeConfig.from_toml("config.toml")

    # Crear servidor
    server = WorkerServer(config)

    try:
        await server.run()
    except KeyboardInterrupt:
        logger.info("Shutdown por usuario")
    finally:
        server.shutdown()
        logger.info("Worker shutdown complete")


if __name__ == "__main__":
    print("🤖 Worker AI - Starting...")
    print()
    asyncio.run(main())
