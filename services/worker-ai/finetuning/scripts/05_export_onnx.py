#!/usr/bin/env python3
"""
Step 5/5 - Export the best checkpoint to ONNX for deployment.
"""
import argparse
import shutil
from pathlib import Path


def export(run_name: str, imgsz: int, opset: int, output_name: str) -> None:
    try:
        from ultralytics import YOLO
    except Exception:
        print("[!] Falta ultralytics. Instalá con: pip install ultralytics")
        raise SystemExit(1)

    run_dir = Path("runs") / run_name
    best_pt = run_dir / "weights" / "best.pt"

    if not best_pt.exists():
        print(f"[!] No existe {best_pt}. Verificá --name (el usado en 04).")
        raise SystemExit(1)

    model = YOLO(str(best_pt))
    model.export(format="onnx", dynamic=True, opset=opset, imgsz=imgsz)

    source = best_pt.parent / "best.onnx"
    if not source.exists():
        print("[!] No se generó el archivo ONNX. Revisá los logs de ultralytics.")
        raise SystemExit(1)

    models_dir = Path("models")
    models_dir.mkdir(parents=True, exist_ok=True)

    destination = models_dir / output_name
    shutil.copy2(source, destination)
    print("[OK] Export ONNX ->", destination)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="05 - Exportar best.pt a ONNX")
    parser.add_argument("--name", default="camera-adapted", help="Nombre del run usado en 04")
    parser.add_argument("--imgsz", type=int, default=640, help="Resolución usada en entrenamiento")
    parser.add_argument("--opset", type=int, default=13, help="Versión opset ONNX")
    parser.add_argument("--out", default="yolo11s_camera.onnx", help="Nombre del ONNX final")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    export(args.name, args.imgsz, args.opset, args.out)


if __name__ == "__main__":
    main()
