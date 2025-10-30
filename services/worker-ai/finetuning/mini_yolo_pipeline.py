#!/usr/bin/env python3
"""
Wrapper for the numbered fine-tuning scripts.

Usage:
    python mini_yolo_pipeline.py <step> [args...]

Steps:
    extract-frames       -> scripts/01_extract_frames.py
    labelstudio-to-yolo  -> scripts/02_labelstudio_to_yolo.py
    split                -> scripts/03_split_dataset.py
    train                -> scripts/04_train_yolo.py
    export-onnx          -> scripts/05_export_onnx.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Dict

SCRIPT_MAP: Dict[str, str] = {
    "extract-frames": "scripts/01_extract_frames.py",
    "labelstudio-to-yolo": "scripts/02_labelstudio_to_yolo.py",
    "split": "scripts/03_split_dataset.py",
    "train": "scripts/04_train_yolo.py",
    "export-onnx": "scripts/05_export_onnx.py",
}


def print_help() -> None:
    print(__doc__)


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print_help()
        return

    step = sys.argv[1]
    script = SCRIPT_MAP.get(step)
    if script is None:
        print(f"[!] Paso '{step}' no reconocido.\n")
        print_help()
        raise SystemExit(1)

    script_path = Path(__file__).parent / script
    if not script_path.exists():
        print(f"[!] El script {script_path} no existe. Revisá la instalación.")
        raise SystemExit(1)

    os.execv(sys.executable, [sys.executable, str(script_path), *sys.argv[2:]])


if __name__ == "__main__":
    main()
