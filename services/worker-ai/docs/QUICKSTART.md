# Quickstart

## Prerrequisitos
- Python 3.10+
- Mamba/Conda (recomendado)
- Modelo YOLO11 en formato ONNX (`services/worker-ai/models/yolo11s.onnx` o similar; montado como `/models` en Docker)

## Instalación (entorno)
```bash
mamba env create -f environment.yml
mamba activate worker-ai
```

## Exportar modelo (si no lo tienes)
```bash
python scripts/export_yolo11s_to_onnx.py
ls -lh ./models/yolo11s.onnx
```

## Configuración
Edita `config.local.toml` (para desarrollo local) o `config.docker.toml`.

Campos clave:
- `[server]`: `bind_host`, `bind_port`
- `[model]`: `conf_threshold`, `nms_iou`, `classes` (opcional)
- `[tracker]`: `enabled`, `config_path`
- `[sessions]`: `output_dir`, `default_fps`, `segment_duration_s`
- `[visualization]`: `enabled`, `window_name`

## Ejecutar
```bash
python worker.py
# o
./run.sh
```

El servidor escucha por defecto en `0.0.0.0:7001`.

## Verificación rápida
```bash
python scripts/inspect_model.py  # inspecciona el ONNX (clases, NMS)
```

## Protocolo v1 (resumen)
- `Init`: edge-agent envía `model`, `classes_filter` (opcional) y `confidence_threshold` (opcional)
- `Frame`: envío de frames (RAW/JPEG) con `frame_id`, `pixel_format`, `codec`
- `Result`: detecciones (bbox normalizadas, conf, class_name, track_id)
- `Heartbeat` y `End`
