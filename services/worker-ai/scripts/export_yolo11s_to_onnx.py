#!/usr/bin/env python3
"""
Descarga y exporta automáticamente el modelo YOLO11-S a formato ONNX con NMS integrado.

El archivo final queda listo para el worker en `../data/models/yolo11s.onnx`.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from ultralytics import YOLO


def parse_args() -> argparse.Namespace:
    default_output = (
        Path(__file__).resolve().parents[1] / "data" / "models" / "yolo11s.onnx"
    )

    parser = argparse.ArgumentParser(
        description="Exporta YOLO11-S a ONNX listo para ONNX Runtime.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--imgsz",
        type=int,
        default=640,
        help="Tamaño de entrada (lado cuadrado) en píxeles.",
    )
    parser.add_argument(
        "--opset",
        type=int,
        default=21,
        help="Versión de opset ONNX compatible con ONNX Runtime.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=default_output,
        help="Ruta destino del modelo ONNX exportado.",
    )
    parser.add_argument(
        "--no-nms",
        action="store_true",
        dest="disable_nms",
        help="Exporta el modelo sin NMS integrado.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output_path: Path = args.output.expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print("=" * 70)
    print("🚀 Exportando YOLO11-S a ONNX")
    print("=" * 70)
    print("📥 Pesos origen: yolo11s.pt (se descarga si no está en caché)")
    print(f"📐 Imagen de entrada: {args.imgsz}x{args.imgsz}")
    print(f"🧠 Opset: {args.opset}")
    print(f"📦 NMS integrado: {'Sí' if not args.disable_nms else 'No'}")
    print(f"📁 Destino final: {output_path}")
    print()

    try:
        print("⏳ Cargando modelo YOLO11-S...")
        model = YOLO("yolo11s.pt")
        print("✅ Modelo cargado correctamente.")
        print(f"   Clases: {len(model.names)}")

        print("\n⏳ Exportando a ONNX...")
        raw_path = model.export(
            format="onnx",
            dynamic=True,
            simplify=True,
            imgsz=args.imgsz,
            opset=args.opset,
            nms=not args.disable_nms,
        )

        exported = Path(raw_path).resolve()
        if exported != output_path:
            output_path.write_bytes(exported.read_bytes())
            exported.unlink()

        size_mb = output_path.stat().st_size / (1024 * 1024)
        print("\n✅ Exportación completada.")
        print(f"   Archivo: {output_path}")
        print(f"   Tamaño: {size_mb:.2f} MB")

        print("\n🎯 Próximos pasos:")
        print(f"  1. Actualiza edge-agent/config.toml → model_name = \"{output_path}\"")
        print("  2. Reinicia el worker y verifica los logs de carga del modelo.")

        print("\n✨ Listo. ¡Disfruta de YOLO11-S!")
        return 0

    except Exception as exc:  # pylint: disable=broad-except
        print(f"\n❌ Error durante la exportación: {exc}")
        import traceback

        traceback.print_exc()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
