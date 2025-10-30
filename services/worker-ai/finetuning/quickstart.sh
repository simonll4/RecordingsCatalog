#!/usr/bin/env bash
# Quickstart: fine-tuning YOLO11-S adaptado a la cámara

set -e

echo "=================================================="
echo "🎯 Fine-tuning YOLO11-S - Quickstart guiado"
echo "=================================================="
echo ""

# 1. Extraer frames
echo "📹 Paso 1: Extraer frames desde recordings/"
echo "   Comando default: python scripts/01_extract_frames.py --src recordings --out frames --fps 1.5 --scale 1280"
echo ""
read -p "¿Ejecutar ahora? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    python scripts/01_extract_frames.py --src recordings --out frames --fps 1.5 --scale 1280
    echo "✅ Frames extraídos en frames/"
else
    echo "⏭️  Saltado. Ejecutá scripts/01_extract_frames.py cuando tengas nuevos videos."
fi
echo ""

# 2. Etiquetado en Label Studio
echo "=================================================="
echo "🏷️  Paso 2: Etiquetar en Label Studio"
echo "=================================================="
echo ""
echo "En otra terminal:"
echo "  pip install label-studio"
echo "  label-studio"
echo "  ➜ http://localhost:8080"
echo "  ➜ Proyecto Object Detection"
echo "  ➜ Importar frames/"
echo "  ➜ Etiquetar clases objetivo: person, bottle, cup, backpack, shoes"
echo "  ➜ Exportar JSON"
echo ""
read -p "¿Ya tenés el JSON exportado? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "⏸️  Volvé cuando tengas el archivo export.json."
    exit 0
fi
echo ""

# 3. Conversión Label Studio → YOLO
echo "=================================================="
echo "📝 Paso 3: Convertir anotaciones y generar dataset/classes.txt"
echo "=================================================="
echo ""
read -p "Ruta al JSON exportado [export.json]: " json_path
json_path=${json_path:-export.json}
read -p "Clases (coma, orden Label Studio) [person,bottle,cup,backpack,shoes]: " classes
classes=${classes:-person,bottle,cup,backpack,shoes}

if [ -f "$json_path" ]; then
    python scripts/02_labelstudio_to_yolo.py \
        --ls-json "$json_path" \
        --images frames \
        --classes "$classes"
    echo "✅ Dataset/_pairs_tmp generado"
else
    echo "❌ Archivo no encontrado: $json_path"
    exit 1
fi
echo ""

# 4. Split train/val
echo "=================================================="
echo "📊 Paso 4: Generar split train/val (80/20)"
echo "=================================================="
python scripts/03_split_dataset.py --ratio 0.8 --seed 42
echo "✅ Dataset dividido en dataset/images|labels/train|val"
echo ""

# 5. Entrenamiento
echo "=================================================="
echo "🚀 Paso 5: Entrenar modelo adaptado"
echo "=================================================="
echo ""
read -p "¿Usar GPU? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    gpu_flag="--gpu"
else
    gpu_flag=""
fi

read -p "Épocas [25]: " epochs
epochs=${epochs:-25}
read -p "Nombre del experimento [camera-adapted]: " run_name
run_name=${run_name:-camera-adapted}

echo ""
echo "Entrenando con $epochs épocas (run: $run_name)..."
python scripts/04_train_yolo.py \
    --model yolo11s.pt \
    --epochs "$epochs" \
    --imgsz 640 \
    --name "$run_name" \
    --lr0 0.001 \
    $gpu_flag

echo "✅ Entrenamiento completado"
echo "   Resultados en: runs/$run_name/"
echo ""

# 6. Export ONNX
echo "=================================================="
echo "📦 Paso 6: Exportar a ONNX"
echo "=================================================="
read -p "Nombre de salida ONNX [yolo11s_camera.onnx]: " onnx_name
onnx_name=${onnx_name:-yolo11s_camera.onnx}

python scripts/05_export_onnx.py \
    --name "$run_name" \
    --imgsz 640 \
    --opset 13 \
    --out "$onnx_name"

echo "✅ Modelo exportado: models/$onnx_name"
echo ""

# Resumen
echo "=================================================="
echo "✅ Pipeline completado"
echo "=================================================="
echo ""
echo "📊 Revisar métricas:"
echo "   cat runs/$run_name/results.csv"
echo "   ls runs/$run_name/*.png"
echo ""
echo "🔌 Integrar con worker-ai:"
echo "   cp models/$onnx_name ../data/models/"
echo "   # Actualizar config del worker (model_path)"
echo ""
echo "🎉 ¡Listo para validar el modelo con tus cámaras!"
