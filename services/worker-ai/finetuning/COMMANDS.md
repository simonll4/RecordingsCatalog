# Comandos Útiles - Fine-tuning YOLO11-S

## Setup Inicial

```bash
# Instalar dependencias
pip install -r requirements.txt

# Verificar instalación
python -c "from ultralytics import YOLO; print('OK')"

# Verificar ffmpeg
ffmpeg -version
```

## Workflow Básico

### 1. Extraer Frames

```bash
# Básico (1.5 fps, escala 1280)
python scripts/01_extract_frames.py

# Más frames (2 fps)
python scripts/01_extract_frames.py --fps 2.0

# Resolución original
python scripts/01_extract_frames.py --scale 0

# Desde otra carpeta
python scripts/01_extract_frames.py --src ../otra/carpeta --out mis_frames
```

### 2. Label Studio

```bash
# Iniciar Label Studio
label-studio

# O en puerto específico
label-studio start --port 8090
```

### 3. Convertir Labels

```bash
# Básico (clases por defecto: person,bottle,cup,backpack,shoes)
python scripts/02_labelstudio_to_yolo.py \
  --ls-json export.json \
  --images frames

# Frames en otra carpeta
python scripts/02_labelstudio_to_yolo.py \
  --ls-json export.json \
  --images mis_frames \
  --classes "person,bottle,cup,backpack,shoes"
```

### 4. Split Dataset

```bash
# 80/20 (default)
python scripts/03_split_dataset.py

# 90/10
python scripts/03_split_dataset.py --ratio 0.9

# Con otro seed
python scripts/03_split_dataset.py --seed 123
```

### 5. Entrenar

```bash
# GPU (recomendado)
python scripts/04_train_yolo.py --gpu

# CPU
python scripts/04_train_yolo.py

# Personalizado
python scripts/04_train_yolo.py \
  --model yolo11s.pt \
  --epochs 30 \
  --imgsz 640 \
  --name mi-modelo \
  --lr0 0.0005 \
  --gpu
```

### 6. Exportar

```bash
# Básico
python scripts/05_export_onnx.py

# Con nombre personalizado
python scripts/05_export_onnx.py \
  --name mi-modelo \
  --out mi_modelo_v1.onnx
```

## Comandos de Ultralytics (Post-training)

### Validar Modelo

```bash
# Validar en dataset
yolo val \
  model=runs/camera-adapted/weights/best.pt \
  data=dataset/data.yaml
```

### Predicciones de Prueba

```bash
# Predecir en imágenes de validación
yolo predict \
  model=runs/camera-adapted/weights/best.pt \
  source=dataset/images/val \
  save=True \
  conf=0.25

# Resultados en: runs/detect/predict/
```

### Comparar Modelos

```bash
# Base model
yolo predict \
  model=yolo11s.pt \
  source=dataset/images/val \
  project=runs/compare \
  name=base \
  save=True

# Fine-tuned model
yolo predict \
  model=runs/camera-adapted/weights/best.pt \
  source=dataset/images/val \
  project=runs/compare \
  name=finetuned \
  save=True

# Comparar visualmente
ls runs/compare/base/
ls runs/compare/finetuned/
```

## Verificación y Debug

### Verificar Dataset

```bash
# Contar imágenes y labels
echo "Train images: $(ls dataset/images/train/*.jpg | wc -l)"
echo "Train labels: $(ls dataset/labels/train/*.txt | wc -l)"
echo "Val images: $(ls dataset/images/val/*.jpg | wc -l)"
echo "Val labels: $(ls dataset/labels/val/*.txt | wc -l)"

# Ver clases
cat dataset/classes.txt
```

### Ver Métricas de Entrenamiento

```bash
# CSV con todas las métricas
cat runs/camera-mini/results.csv

# Ver última línea (mejor resultado)
tail -n 1 runs/camera-mini/results.csv
```

### Ver Gráficos

```bash
# Listar gráficos generados
ls runs/camera-mini/*.png

# Abrir gráfico de resultados
xdg-open runs/camera-mini/results.png  # Linux
open runs/camera-mini/results.png      # macOS
```

### Verificar Modelo ONNX

```bash
# Tamaño del modelo
ls -lh models/*.onnx

# Info del modelo (requiere onnx)
python -c "import onnx; m=onnx.load('models/yolo11s_finetuned.onnx'); print(f'Inputs: {[i.name for i in m.graph.input]}'); print(f'Outputs: {[o.name for o in m.graph.output]}')"
```

## Limpieza

```bash
# Limpiar runs de entrenamiento
rm -rf runs/camera-mini*

# Limpiar dataset temporal
rm -rf dataset/_pairs_tmp

# Limpiar frames extraídos
rm -rf frames/*

# Reset completo (¡cuidado\!)
rm -rf frames/* dataset/* runs/* models/*
```

## Re-entrenamiento

```bash
# Continuar desde modelo anterior
python mini_yolo_pipeline.py train \
  --model runs/camera-mini/weights/best.pt \
  --epochs 10 \
  --name camera-mini-v2 \
  --gpu

# Exportar nueva versión
python mini_yolo_pipeline.py export-onnx \
  --name camera-mini-v2 \
  --out yolo11s_finetuned_v2.onnx
```

## One-Liners Útiles

```bash
# Contar objetos por clase en labels
grep -h "^0 " dataset/labels/train/*.txt | wc -l  # clase 0
grep -h "^1 " dataset/labels/train/*.txt | wc -l  # clase 1

# Ver distribución de clases
for i in 0 1 2; do echo "Clase $i: $(grep -h "^$i " dataset/labels/train/*.txt | wc -l)"; done

# Último modelo entrenado
ls -lt runs/*/weights/best.pt | head -1

# Copiar modelo al worker
cp models/yolo11s_finetuned.onnx ../data/models/

# Backup de modelo anterior
cp ../data/models/yolo11s.onnx ../data/models/yolo11s_backup_$(date +%Y%m%d).onnx
```

## Ayuda

```bash
# Ver comandos disponibles
python mini_yolo_pipeline.py --help

# Ayuda de comando específico
python mini_yolo_pipeline.py extract-frames --help
python mini_yolo_pipeline.py train --help
python mini_yolo_pipeline.py export-onnx --help
```
