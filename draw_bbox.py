#!/usr/bin/env python3
"""
Utility script to draw a bounding box on an image.

Configure the image, output path and bounding box values in the constants
below. By default the script interprets x/y as the centre of the box with
normalized (0-1) coordinates, but you can change that behaviour.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Tuple

try:
    from PIL import Image, ImageDraw
except ImportError as exc:  # pragma: no cover - surface a clear message
    raise SystemExit(
        "The Pillow package is required. Install it with 'pip install Pillow'."
    ) from exc


IMAGE_PATH = Path("./data/frames/sess_cam-local_1762404227840_1/track_3.jpg")
# Deja OUTPUT_PATH en None para usar el nombre original con sufijo '_bbox'.
OUTPUT_PATH: Path | None = None
BOUNDING_BOX = {"h": 0.3890821635723114, "w": 0.14148828387260437, "x": 0.48584939539432526, "y": 0.5182678252458572}
ANCHOR = "center"  # Usa "topleft" si x/y representan la esquina superior izquierda.
MODE = "normalized"  # Cambia a "absolute" cuando la caja está en píxeles.
COLOR = "#ff0000"
THICKNESS = 3


def compute_rectangle(
    bbox: Dict[str, float],
    image_size: Tuple[int, int],
    anchor: str,
    mode: str,
) -> Tuple[int, int, int, int]:
    """Translate the bbox into pixel coordinates (left, top, right, bottom)."""
    img_w, img_h = image_size

    x = bbox["x"]
    y = bbox["y"]
    w = bbox["w"]
    h = bbox["h"]

    if mode == "normalized":
        x *= img_w
        y *= img_h
        w *= img_w
        h *= img_h

    if anchor == "center":
        left = x - w / 2.0
        top = y - h / 2.0
    else:  # anchor == "topleft"
        left = x
        top = y

    right = left + w
    bottom = top + h

    # Clamp to image bounds so we never draw outside the canvas.
    left = max(0.0, min(left, img_w))
    top = max(0.0, min(top, img_h))
    right = max(0.0, min(right, img_w))
    bottom = max(0.0, min(bottom, img_h))

    if left >= right or top >= bottom:
        raise ValueError("La bounding box no tiene un área válida dentro de la imagen.")

    return int(round(left)), int(round(top)), int(round(right)), int(round(bottom))


def main() -> None:
    image_path = IMAGE_PATH
    if not image_path.is_file():
        raise SystemExit(f"La imagen '{image_path}' no existe. Ajusta IMAGE_PATH.")

    bbox = {}
    for key in ("x", "y", "w", "h"):
        if key not in BOUNDING_BOX:
            raise SystemExit(f"Falta la clave '{key}' en BOUNDING_BOX.")
        try:
            bbox[key] = float(BOUNDING_BOX[key])
        except (TypeError, ValueError) as exc:
            raise SystemExit(f"El valor de '{key}' debe ser numérico.") from exc

    if THICKNESS < 1:
        raise SystemExit("El grosor de la línea debe ser un entero positivo.")

    output_path = (
        OUTPUT_PATH
        if OUTPUT_PATH is not None
        else image_path.with_name(f"{image_path.stem}_bbox{image_path.suffix}")
    )

    try:
        with Image.open(image_path) as img:
            rect = compute_rectangle(
                bbox=bbox,
                image_size=img.size,
                anchor=ANCHOR,
                mode=MODE,
            )
            draw = ImageDraw.Draw(img)
            draw.rectangle(rect, outline=COLOR, width=THICKNESS)
            img.save(output_path)
    except Exception as exc:
        raise SystemExit(f"No se pudo procesar la imagen: {exc}") from exc

    print(f"Imagen anotada guardada en: {output_path}")


if __name__ == "__main__":
    main()
