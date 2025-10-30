#!/usr/bin/env python3
"""
Step 2/5 - Convert Label Studio export JSON into YOLO dataset format.
"""
import argparse
import json
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

from common import DEFAULT_CLASSES, ensure_dataset_dirs, ensure_dir

PairList = List[Tuple[Path, List[Tuple[int, float, float, float, float]]]]


def load_labelstudio_json(json_path: Path) -> List[Dict]:
    try:
        return json.loads(json_path.read_text())
    except json.JSONDecodeError as exc:
        print(f"[!] Error al parsear {json_path}: {exc}")
        raise SystemExit(1)


def resolve_image(images_dir: Path, image_name: str) -> Path | None:
    candidate = images_dir / image_name
    if candidate.exists():
        return candidate
    matches = list(images_dir.rglob(image_name))
    if matches:
        return matches[0]
    return None


def convert_annotations(
    data: Iterable[Dict], images_dir: Path, class_names: List[str]
) -> PairList:
    name_to_id = {name: idx for idx, name in enumerate(class_names)}
    pairs: PairList = []

    for item in data:
        image_path = item.get("data", {}).get("image") or item.get("data", {}).get("img")
        if not image_path:
            continue

        image_name = Path(image_path).name
        resolved = resolve_image(images_dir, image_name)
        if resolved is None:
            print(f"[WARN] No se encontró la imagen {image_name} en {images_dir}")
            continue

        boxes: List[Tuple[int, float, float, float, float]] = []
        for annotation in item.get("annotations", []):
            for result in annotation.get("result", []):
                value = result.get("value", {})
                labels = value.get("rectanglelabels") or value.get("labels")
                if not labels:
                    continue

                cls = labels[0]
                if cls not in name_to_id:
                    print(f"[WARN] Clase '{cls}' no está en --classes, se ignora")
                    continue

                x = float(value.get("x", 0.0))
                y = float(value.get("y", 0.0))
                w = float(value.get("width", 0.0))
                h = float(value.get("height", 0.0))

                cx = (x + w / 2.0) / 100.0
                cy = (y + h / 2.0) / 100.0
                ww = w / 100.0
                hh = h / 100.0
                boxes.append((name_to_id[cls], cx, cy, ww, hh))

        pairs.append((resolved, boxes))

    return pairs


def write_pairs(pairs: PairList, output_root: Path) -> None:
    ensure_dir(output_root)
    with open(output_root / "pairs.txt", "w") as handle:
        for image, boxes in pairs:
            box_tokens = [
                f"{box[0]} {box[1]:.6f} {box[2]:.6f} {box[3]:.6f} {box[4]:.6f}"
                for box in boxes
            ]
            handle.write(str(image) + "|" + ";".join(box_tokens) + "\n")


def labelstudio_to_yolo(json_path: Path, images_dir: Path, class_names: List[str]) -> None:
    dataset_dir = Path("dataset")
    tmp_dir = dataset_dir / "_pairs_tmp"

    ensure_dataset_dirs(dataset_dir)

    data = load_labelstudio_json(json_path)
    pairs = convert_annotations(data, images_dir, class_names)

    write_pairs(pairs, tmp_dir)
    (dataset_dir / "classes.txt").write_text("\n".join(class_names))

    print("[OK] Pairs intermedios en dataset/_pairs_tmp/pairs.txt")
    print("[OK] Clases en dataset/classes.txt:", ", ".join(class_names))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="02 - Convertir export JSON de Label Studio a formato YOLO"
    )
    parser.add_argument("--ls-json", required=True, help="Export JSON de Label Studio")
    parser.add_argument(
        "--images",
        default="frames",
        help="Carpeta donde están las imágenes etiquetadas",
    )
    parser.add_argument(
        "--classes",
        default=",".join(DEFAULT_CLASSES),
        help="Lista de clases separadas por coma en el mismo orden que Label Studio",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    class_names = [name.strip() for name in args.classes.split(",") if name.strip()]
    if not class_names:
        print("[!] Debes especificar al menos una clase.")
        raise SystemExit(1)

    labelstudio_to_yolo(Path(args.ls_json), Path(args.images), class_names)


if __name__ == "__main__":
    main()
