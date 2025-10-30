#!/usr/bin/env python3
"""
Utilities shared by the fine-tuning scripts.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Iterable, List

DEFAULT_CLASSES: List[str] = ["person", "bottle", "cup", "backpack", "shoes"]


def run_cmd(cmd: Iterable[str]) -> str:
    """Run a shell command and abort on failure."""
    cmd = list(cmd)
    print("[cmd]", " ".join(cmd))
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if result.returncode != 0:
        print(result.stdout)
        sys.exit(result.returncode)
    return result.stdout


def ensure_dir(path: Path | str) -> None:
    """Create directory if it does not exist."""
    Path(path).mkdir(parents=True, exist_ok=True)


def ensure_dataset_dirs(base: Path | str = Path("dataset")) -> None:
    """Ensure YOLO dataset directory structure exists."""
    base_path = Path(base)
    for subset in ("train", "val"):
        ensure_dir(base_path / "images" / subset)
        ensure_dir(base_path / "labels" / subset)


def write_default_classes(target: Path | str = Path("dataset/classes.txt")) -> Path:
    """Write default class list to dataset/classes.txt if the file is missing."""
    target_path = Path(target)
    if not target_path.exists():
        ensure_dir(target_path.parent)
        target_path.write_text("\n".join(DEFAULT_CLASSES))
    return target_path


def read_classes(path: Path | str = Path("dataset/classes.txt")) -> List[str]:
    """Read class list from disk."""
    path = Path(path)
    if not path.exists():
        print(f"[!] No se encontró {path}. Ejecutá el script 02 para generarlo.")
        sys.exit(1)
    return [line.strip() for line in path.read_text().splitlines() if line.strip()]
