# Fine-tuning YOLO11-S - Pipeline Modular

La adaptación a tu cámara se centra en detectar: **person**, **bottle**, **cup**, **backpack** y **shoes**.  
El pipeline ahora está dividido en scripts numerados para mantener cada paso pequeño y claro.

## 📂 Estructura (clave)

```
finetuning/
├── mini_yolo_pipeline.py         # Wrapper (compatibilidad) → delega en scripts/*
├── scripts/
│   ├── 01_extract_frames.py      # Paso 1 - frames
│   ├── 02_labelstudio_to_yolo.py # Paso 2 - conversión de anotaciones
│   ├── 03_split_dataset.py       # Paso 3 - split train/val
│   ├── 04_train_yolo.py          # Paso 4 - entrenamiento
│   ├── 05_export_onnx.py         # Paso 5 - export ONNX
│   ├── common.py                 # Utilidades compartidas
│   └── __init__.py
├── recordings/                   # Tus videos .mp4 (origen)
├── frames/                       # Frames extraídos
├── dataset/
│   ├── images/{train,val}
│   └── labels/{train,val}
├── runs/                         # Resultados de entrenamiento
└── models/                       # Modelos ONNX exportados
```

> `mini_yolo_pipeline.py` continúa existiendo, pero ahora sólo reenvía al script numerado correspondiente.  
> Recomendación: ejecutar directamente cada `scripts/0X_*.py` para tener el control paso a paso.

## 🚀 Requisitos

```bash
pip install -r requirements.txt   # incluye ultralytics
sudo apt install ffmpeg           # si aún no lo tienes
```

## 🧭 Paso a paso (scripts numerados)

### 1️⃣ Extraer frames (adapta iluminación y ángulos de tu cámara)

```bash
python scripts/01_extract_frames.py \
  --src recordings \
  --out frames \
  --fps 1.5 \
  --scale 1280
```

Resultado: subcarpetas en `frames/` con JPG listos para etiquetar.

### 2️⃣ Convertir anotaciones de Label Studio → YOLO

```bash
python scripts/02_labelstudio_to_yolo.py \
  --ls-json export.json \
  --images frames
  # --classes usa por defecto: person,bottle,cup,backpack,shoes
```

Esto genera:
- `dataset/_pairs_tmp/pairs.txt`
- `dataset/classes.txt` (con tus clases objetivo)

### 3️⃣ Dividir dataset train/val

```bash
python scripts/03_split_dataset.py --ratio 0.8 --seed 42
```

Resultado: imágenes y labels en `dataset/images|labels/train|val/`.

### 4️⃣ Entrenar YOLO11-S adaptado a la cámara

```bash
python scripts/04_train_yolo.py \
  --model yolo11s.pt \
  --epochs 25 \
  --imgsz 640 \
  --name camera-adapted \
  --lr0 0.001 \
  --gpu           # opcional
```

Resultado: checkpoint en `runs/camera-adapted/weights/best.pt`.

### 5️⃣ Exportar a ONNX para worker-ai

```bash
python scripts/05_export_onnx.py \
  --name camera-adapted \
  --imgsz 640 \
  --opset 13 \
  --out yolo11s_camera.onnx
```

Resultado: `models/yolo11s_camera.onnx`.

## 🧩 Compatibilidad con el wrapper

Si ya tenías automatizaciones basadas en el script monolítico:

```bash
python mini_yolo_pipeline.py extract-frames
python mini_yolo_pipeline.py labelstudio-to-yolo --ls-json export.json
python mini_yolo_pipeline.py split
python mini_yolo_pipeline.py train --gpu
python mini_yolo_pipeline.py export-onnx
```

Cada subcomando llama internamente al script numerado correspondiente, por lo que los argumentos siguen siendo válidos.

## ⚙️ Opciones útiles

- `01_extract_frames.py --fps 2.0` → más densidad de frames.
- `02_labelstudio_to_yolo.py --classes "person,bottle,cup,backpack,shoes"` → explícito si ajustas el orden.
- `03_split_dataset.py --ratio 0.9` → más datos para entrenamiento.
- `04_train_yolo.py --epochs 35 --lr0 5e-4` → entrenamiento más extenso y estable.
- `05_export_onnx.py --out camera_v2.onnx` → variantes para versiones.

## 📊 Validación y revisión

- Métricas: `cat runs/camera-adapted/results.csv`
- Gráficos: `ls runs/camera-adapted/*.png`
- Validación CLI: `yolo val model=runs/camera-adapted/weights/best.pt data=dataset/data.yaml`
- Predicciones de prueba: `yolo predict model=runs/camera-adapted/weights/best.pt source=dataset/images/val save=True`

## 🐛 Troubleshooting rápido

- **No mp4 encontrados** → verifica `recordings/`.
- **Falta ultralytics** → `pip install ultralytics`.
- **Clase desconocida** → confirma el orden en `--classes`.
- **Sin mejora** → más datos de las condiciones reales (iluminación/día/noche) y más épocas.
- **Falsos positivos** → subí el `conf_threshold` o agrega ejemplos negativos.

## 🔁 Reentrenos incrementales

1. Captura nuevos videos (distintas horas/condiciones).
2. `python scripts/01_extract_frames.py` sobre los videos nuevos.
3. Anota únicamente los frames nuevos en Label Studio.
4. Ejecuta scripts 02 → 05 (puedes reusar `runs/camera-adapted/weights/best.pt` como `--model` para seguir fine-tune).

## 🔌 Integración con worker-ai

```bash
cp models/yolo11s_camera.onnx ../data/models/
# Actualiza configuración del worker:
# model_path = "data/models/yolo11s_camera.onnx"
```

## 📚 Más recursos

- `COMMANDS.md` → ejemplos concretos de cada paso.
- `quickstart.sh` → guía interactiva paso a paso.
- `RESUMEN.md` → visión ejecutiva del flujo.

---

¿Dudas puntuales? Ejecutá cualquier script con `--help` para ver argumentos disponibles.
