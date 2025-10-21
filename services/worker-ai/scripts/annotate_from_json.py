#!/usr/bin/env python
import argparse
import json
import os
import sys
from pathlib import Path
from typing import Dict, List

import cv2
import numpy as np
import supervision as sv

# Constantes para ejecución rápida (ajusta estas dos y corre el script sin argumentos)
RECORDINGS_BASE = "/home/simonll4/Desktop/final-scripting/tpfinal-v3/data/recordings"
TRACKS_BASE = "/home/simonll4/Desktop/final-scripting/tpfinal-v3/data/tracks"

# Pon aquí el nombre exacto del archivo de video y el ID de sesión
# Ejemplos de nombres encontrados: "43-852812.mp4", "34-931913.mp4"
VIDEO_FILENAME = "40-573548.mp4"
SESSION_ID = "sess_cam-local_1760839179181_1"


def find_video_in_recordings(video_id: str, recordings_base: str = "/home/simonll4/Desktop/final-scripting/tpfinal-v3/data/recordings") -> str | None:
    """Find video file in recordings directory based on video_id (format: YYYYMMDD_HHMMSS).
    
    Args:
        video_id: Video ID in format YYYYMMDD_HHMMSS (e.g., 20251016_103005)
        recordings_base: Base path to recordings directory
    
    Returns:
        Full path to video file if found, None otherwise
    """
    try:
        # Parse video_id: YYYYMMDD_HHMMSS
        if len(video_id) != 15 or '_' not in video_id:
            return None
        
        date_part, time_part = video_id.split('_')
        if len(date_part) != 8 or len(time_part) != 6:
            return None
        
        year = date_part[0:4]
        month = date_part[4:6]
        day = date_part[6:8]
        hour = time_part[0:2]
        minute = time_part[2:4]
        # second = time_part[4:6]  # Not used for directory structure
        
        # Build search path: cam-local/YYYY/MM/DD/HH/MM/
        search_dir = Path(recordings_base) / "cam-local" / year / month / day / hour / minute
        
        if not search_dir.exists():
            return None
        
        # Find .mp4 files in this directory
        mp4_files = list(search_dir.glob("*.mp4"))
        if mp4_files:
            # Return the first match (should typically be only one)
            return str(mp4_files[0])
        
        return None
    except Exception:
        return None


def find_video_by_filename(filename: str, recordings_base: str) -> str | None:
    """Busca recursivamente un archivo de video por nombre dentro de recordings.

    Retorna la ruta completa si lo encuentra, o None si no existe.
    """
    try:
        base = Path(recordings_base)
        if not filename:
            return None
        # Buscar solo bajo cam-local para ser más específico
        for p in (base / "cam-local").rglob(filename):
            if p.is_file():
                return str(p)
        return None
    except Exception:
        return None


def load_events_to_frame_map(tracks_path: str, fps: float) -> Dict[int, List[dict]]:
    """Carga tracks.jsonl y devuelve un mapa frame_index -> lista de objetos.

    Preferimos la clave 'frame' si está presente. Si no, caemos a 't_rel_s' o 't' multiplicado por fps.
    """
    frame_map: Dict[int, List[dict]] = {}
    with open(tracks_path, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            evt = json.loads(line)
            fr = evt.get("frame")
            if fr is None:
                t = evt.get("t_rel_s")
                if t is None:
                    t = evt.get("t", 0.0)
                fr = int(round(float(t) * fps))
            frame_map[int(fr)] = evt.get("objs", [])
    return frame_map


def annotate_video(video_path: str, tracks_path: str, out_path: str | None = None,
                   preview: bool = False, log: bool = False, filter_classes: List[str] | None = None,
                   thickness: int = 2, text_scale: float = 0.5) -> str:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"No se pudo abrir el video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    frame_map = load_events_to_frame_map(tracks_path, fps=fps)

    if out_path is None:
        base, _ = os.path.splitext(video_path)
        out_path = base + "_annotated.mp4"

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    # Asegura que exista el directorio de salida
    out_dir = os.path.dirname(out_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    writer = cv2.VideoWriter(out_path, fourcc, fps, (width, height))
    if not writer.isOpened():
        raise RuntimeError(f"No se pudo abrir el escritor de video: {out_path}")

    box_annotator = sv.BoxAnnotator(thickness=thickness)
    label_annotator = sv.LabelAnnotator(text_scale=text_scale)

    frame_idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break

        # Usar CAP_PROP_POS_FRAMES para obtener el frame actual del video
        current_frame = int(cap.get(cv2.CAP_PROP_POS_FRAMES)) - 1
        objs = frame_map.get(current_frame, [])
        if log and (current_frame % 5 == 0):
            print(f"video frame {current_frame}: {len(objs)} objs", file=sys.stderr)
        if objs:
            # Normalizamos campos para soportar distintos esquemas
            def obj_cls_name(o: dict) -> str:
                if o.get("cls_name") is not None:
                    return str(o["cls_name"])
                if isinstance(o.get("cls"), str):
                    return o["cls"]
                if o.get("cls") is not None:
                    return str(o["cls"])  # id numérico a string
                return "obj"

            # Optional class filter (por nombre)
            if filter_classes:
                objs = [o for o in objs if obj_cls_name(o) in filter_classes]

            # Convert to absolute pixels
            xyxy = []
            ids = []
            class_ids = []
            labels = []

            # Build a name->id mapping en base a los nombres
            names = sorted({obj_cls_name(o) for o in objs})
            name_to_id = {n: i for i, n in enumerate(names)}

            for o in objs:
                # bbox puede venir como 'bbox_xyxy' normalizado o 'xyxy'
                if o.get("bbox_xyxy") is not None:
                    x1n, y1n, x2n, y2n = o["bbox_xyxy"]
                else:
                    x1n, y1n, x2n, y2n = o.get("xyxy", [0, 0, 0, 0])

                x1 = float(x1n) * width
                y1 = float(y1n) * height
                x2 = float(x2n) * width
                y2 = float(y2n) * height
                xyxy.append([x1, y1, x2, y2])

                track_id = o.get("track_id")
                if track_id is None:
                    track_id = o.get("id", -1)
                ids.append(int(track_id) if track_id is not None else -1)

                cname = obj_cls_name(o)
                class_ids.append(int(name_to_id.get(cname, -1)))

                conf = o.get("conf")
                if conf is not None:
                    labels.append(f"{cname}#{track_id}:{float(conf):.2f}")
                else:
                    labels.append(f"{cname}#{track_id}")

            det = sv.Detections(
                xyxy=np.array(xyxy, dtype=np.float32),
                tracker_id=np.array(ids, dtype=np.int32),
                class_id=np.array(class_ids, dtype=np.int32),
            )
            frame = box_annotator.annotate(scene=frame, detections=det)
            frame = label_annotator.annotate(scene=frame, detections=det, labels=labels)

        # Dibuja índice de frame para depurar alineación
        cv2.putText(frame, f"f={current_frame}", (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2, cv2.LINE_AA)

        writer.write(frame)

        if preview:
            cv2.imshow("preview", frame)
            if cv2.waitKey(1) == 27:  # ESC
                break

    cap.release()
    writer.release()
    if preview:
        cv2.destroyAllWindows()
    return out_path


def main():
    p = argparse.ArgumentParser(description="Anotar video a partir de tracks en JSONL")
    g = p.add_mutually_exclusive_group(required=False)
    g.add_argument("--video_id", help="ID con formato YYYYMMDD_HHMMSS para buscar en recordings/")
    g.add_argument("--video", help="Ruta directa al video .mp4 (salta la búsqueda)")
    p.add_argument("--tracks", help="Ruta a tracks .jsonl (si usas --video)")
    p.add_argument("--out", help="Ruta de salida del MP4 anotado", default="/home/simonll4/Desktop/final-scripting/tpfinal-v3/data//annotated.mp4")
    p.add_argument("--preview", action="store_true", help="Mostrar vista previa en pantalla")
    p.add_argument("--log", action="store_true", help="Loguear cantidad de objetos por frame")
    p.add_argument("--classes", help="Filtro de clases, separadas por coma")
    p.add_argument("--thickness", type=int, default=2)
    p.add_argument("--text_scale", type=float, default=0.5)
    args = p.parse_args()

    video_path = None
    tracks_path = None
    out_path = args.out

    if args.video:
        if not args.tracks:
            print("--tracks es obligatorio cuando usas --video", file=sys.stderr)
            sys.exit(2)
        video_path = args.video
        tracks_path = args.tracks
    elif args.video_id:
        video_path = find_video_in_recordings(args.video_id, recordings_base=RECORDINGS_BASE)
        if not video_path:
            print(f"No se encontró el video para ID: {args.video_id}", file=sys.stderr)
            print("Formato esperado: YYYYMMDD_HHMMSS (ej: 20251016_103005)", file=sys.stderr)
            print(f"Buscado en: {RECORDINGS_BASE}/cam-local/", file=sys.stderr)
            sys.exit(2)
        # Para este modo, no conocemos SESSION_ID. Requiere --tracks.
        print("Aviso: usa --tracks para indicar el archivo de anotaciones o usa el modo por constantes.", file=sys.stderr)
        if not args.tracks:
            sys.exit(2)
        tracks_path = args.tracks
    else:
        # Modo por constantes rápidas
        video_path = find_video_by_filename(VIDEO_FILENAME, recordings_base=RECORDINGS_BASE)
        if not video_path:
            print(f"No se encontró el archivo '{VIDEO_FILENAME}' en {RECORDINGS_BASE}/cam-local/", file=sys.stderr)
            print("Asegúrate de poner el nombre correcto en VIDEO_FILENAME.", file=sys.stderr)
            sys.exit(2)
        sess_dir = Path(TRACKS_BASE) / SESSION_ID / "tracks"
        # Usamos el primer segmento por defecto: seg-0000.jsonl
        tracks_path = str(sess_dir / "seg-0000.jsonl")
        if not os.path.exists(tracks_path):
            print(f"No se encontró el tracks .jsonl en {tracks_path}", file=sys.stderr)
            print("Revisa SESSION_ID o especifica --tracks manualmente.", file=sys.stderr)
            sys.exit(2)

    if out_path is None:
        base, _ = os.path.splitext(video_path)
        out_path = base + "_annotated.mp4"

    filter_classes = None
    if args.classes:
        filter_classes = [c.strip() for c in args.classes.split(",") if c.strip()]

    out = annotate_video(
        video_path=video_path,
        tracks_path=tracks_path,
        out_path=out_path,
        preview=bool(args.preview),
        log=bool(args.log),
        filter_classes=filter_classes,
        thickness=args.thickness,
        text_scale=args.text_scale,
    )
    print("Video anotado:", out)


if __name__ == "__main__":
    main()
