#!/usr/bin/env python3
"""
Step 1/5 - Extract frames from camera recordings for annotation.
"""
import argparse
from pathlib import Path

from common import ensure_dir, run_cmd


def extract_frames(src_dir: Path, out_dir: Path, fps: float, scale: int) -> None:
    ensure_dir(out_dir)
    mp4_files = sorted(src_dir.glob("*.mp4"))

    if not mp4_files:
        print(f"[!] No se encontraron archivos .mp4 en {src_dir}")
        raise SystemExit(1)

    for video in mp4_files:
        frame_dir = out_dir / video.stem
        ensure_dir(frame_dir)

        filters = [f"fps={fps}"]
        if scale > 0:
            filters.append(f"scale={scale}:-1")

        vf_filter = ",".join(filters)
        dst_pattern = frame_dir / f"{video.stem}_%04d.jpg"

        run_cmd(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(video),
                "-vf",
                vf_filter,
                "-q:v",
                "2",
                str(dst_pattern),
            ]
        )

    print("[OK] Frames extraídos en", out_dir)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="01 - Extraer frames de recordings/*.mp4 con FFmpeg"
    )
    parser.add_argument("--src", default="recordings", help="Carpeta con videos .mp4")
    parser.add_argument("--out", default="frames", help="Carpeta de salida de frames")
    parser.add_argument("--fps", type=float, default=1.5, help="Frames por segundo")
    parser.add_argument(
        "--scale", type=int, default=1280, help="Ancho de reescalado (0 conserva)"
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    extract_frames(Path(args.src), Path(args.out), args.fps, args.scale)


if __name__ == "__main__":
    main()
