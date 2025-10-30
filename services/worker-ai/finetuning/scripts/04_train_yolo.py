#!/usr/bin/env python3
"""
Step 4/5 - Train YOLO11 with the curated dataset.
"""
import argparse
from pathlib import Path

from common import read_classes


def train(
    model_path: str,
    epochs: int,
    imgsz: int,
    run_name: str,
    lr0: float,
    use_gpu: bool,
) -> None:
    try:
        from ultralytics import YOLO
    except Exception:
        print("[!] Falta ultralytics. Instalá con: pip install ultralytics")
        raise SystemExit(1)

    classes = read_classes(Path("dataset/classes.txt"))
    data_yaml = Path("dataset/data.yaml")

    content = [
        f"path: {Path('dataset').resolve()}",
        "train: images/train",
        "val: images/val",
        "names:",
    ]
    content.extend(f"  {idx}: {name}" for idx, name in enumerate(classes))
    data_yaml.write_text("\n".join(content) + "\n")

    model = YOLO(model_path)
    model.train(
        data=str(data_yaml),
        epochs=epochs,
        imgsz=imgsz,
        batch="auto",
        device=0 if use_gpu else "cpu",
        project="runs",
        name=run_name,
        lr0=lr0,
        cos_lr=True,
        patience=12,
        verbose=True,
    )
    print(f"[OK] Entrenamiento terminado. Revisá runs/{run_name}/weights/best.pt")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="04 - Entrenar YOLO con Ultralytics")
    parser.add_argument("--model", default="yolo11s.pt", help="Checkpoint base (ej: yolo11s.pt)")
    parser.add_argument("--epochs", type=int, default=25, help="Cantidad de épocas")
    parser.add_argument("--imgsz", type=int, default=640, help="Resolución de entrenamiento")
    parser.add_argument("--name", default="camera-adapted", help="Nombre del experimento (runs/<name>)")
    parser.add_argument("--lr0", type=float, default=1e-3, help="Learning rate inicial")
    parser.add_argument("--gpu", action="store_true", help="Usar GPU (device=0)")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    train(args.model, args.epochs, args.imgsz, args.name, args.lr0, args.gpu)


if __name__ == "__main__":
    main()
