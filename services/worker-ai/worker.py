#!/usr/bin/env python3
"""Worker AI - Punto de entrada principal"""
import sys
from pathlib import Path

# Agregar src al path
sys.path.insert(0, str(Path(__file__).parent))

# Ejecutar main
from src.main import main
import asyncio

if __name__ == "__main__":
    asyncio.run(main())
