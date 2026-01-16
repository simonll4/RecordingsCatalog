#!/usr/bin/env python3
"""
Step 3/5 - Split dataset pairs into YOLO train/val folders.
"""
import argparse
import random
import shutil
from pathlib import Path

from common import ensure_dataset_dirs


def copy_pair(line: str, subset: str, images_root: Path, labels_root: Path) -> None:
    image_path_str, yolo_str = line.split("|", 1)
    image_path = Path(image_path_str)
    basename = image_path.stem

    dst_image = images_root / subset / f"{basename}.jpg"
    dst_label = labels_root / subset / f"{basename}.txt"

    dst_image.parent.mkdir(parents=True, exist_ok=True)
    dst_label.parent.mkdir(parents=True, exist_ok=True)

    shutil.copy2(image_path, dst_image)

    if yolo_str.strip():
        with open(dst_label, "w") as handle:
            for token in yolo_str.split(";"):
                token = token.strip()
                if token:
                    handle.write(token + "\n")
    else:
        open(dst_label, "w").close()


def split_pairs(pairs_file: Path, ratio: float, seed: int) -> None:
    if not pairs_file.exists():
        print(f"[!] No existe {pairs_file}. Ejecutá el script 02 primero.")
        raise SystemExit(1)

    lines = [line.strip() for line in pairs_file.read_text().splitlines() if line.strip()]
    if not lines:
        print("[!] No hay pares para volcar. Verificá tus anotaciones.")
        raise SystemExit(1)

    random.seed(seed)
    random.shuffle(lines)

    cut = int(len(lines) * ratio)
    splits = {"train": lines[:cut], "val": lines[cut:]}

    dataset_dir = Path("dataset")
    images_root = dataset_dir / "images"
    labels_root = dataset_dir / "labels"
    ensure_dataset_dirs(dataset_dir)

    for subset, items in splits.items():
        for line in items:
            copy_pair(line, subset, images_root, labels_root)

    print("[OK] Split listo. Imágenes/labels en dataset/images|labels/train|val")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="03 - Partir dataset en train/val (80/20 por defecto)"
    )
    parser.add_argument("--ratio", type=float, default=0.8, help="Proporción train")
    parser.add_argument("--seed", type=int, default=42, help="Semilla del shuffle")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    pairs_file = Path("dataset/_pairs_tmp/pairs.txt")
    split_pairs(pairs_file, args.ratio, args.seed)


if __name__ == "__main__":
    main()
