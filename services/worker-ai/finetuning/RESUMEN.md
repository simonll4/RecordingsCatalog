# 🎯 Sistema de Fine-tuning YOLO11-S - Resumen

## ✅ Estructura Clave

```
finetuning/
├── mini_yolo_pipeline.py   ↪ Wrapper (compatibilidad)
├── scripts/                ⭐ Pipeline modular
│   ├── 01_extract_frames.py
│   ├── 02_labelstudio_to_yolo.py
│   ├── 03_split_dataset.py
│   ├── 04_train_yolo.py
│   ├── 05_export_onnx.py
│   └── common.py
├── README.md               📖 Documentación actualizada
├── COMMANDS.md             📝 Comandos rápidos por paso
├── quickstart.sh           🚀 Ejecución guiada (actualizado)
├── recordings/             📹 Videos fuente (8 listos)
├── frames/                 🖼️  Frames extraídos
├── dataset/                📊 Dataset YOLO (train/val)
├── runs/                   📈 Resultados de entrenamiento
└── models/                 🧠 Modelos ONNX exportados
```

## 🚀 Workflow Modular (5 pasos)

```bash
cd finetuning

# 1️⃣ Frames desde tus grabaciones
python scripts/01_extract_frames.py

# 2️⃣ Conversion Label Studio → YOLO (clases por defecto: person,bottle,cup,backpack,shoes)
python scripts/02_labelstudio_to_yolo.py --ls-json export.json

# 3️⃣ Split train/val
python scripts/03_split_dataset.py

# 4️⃣ Entrenamiento adaptado a la cámara
python scripts/04_train_yolo.py --gpu

# 5️⃣ Export ONNX listo para worker-ai
python scripts/05_export_onnx.py
```

## 🎯 Clases foco

Detección optimizada para: **person**, **bottle**, **cup**, **backpack**, **shoes**  
El script 02 genera automáticamente `dataset/classes.txt` con ese listado (puedes editarlo si necesitás variantes).

## 📊 Estado Actual

✅ 8 videos disponibles en `recordings/`  
✅ Scripts numerados y probados individualmente  
✅ Documentación y quickstart alineados con la estructura nueva  
✅ Wrapper `mini_yolo_pipeline.py` mantiene compatibilidad con automatizaciones previas

## 🎓 Modo Presentación

```bash
./quickstart.sh                    # Experiencia guiada
python scripts/04_train_yolo.py --help   # Ayuda contextual por paso
sed -n '1,120p' README.md          # Documentación resumida
```

## 💡 Tips

1. Capturá datos en distintos horarios para cubrir variaciones de luz.
2. Si hace falta reforzar una clase, agregá más ejemplos y re-ejecutá scripts 02→05.
3. Podés usar `runs/camera-adapted/weights/best.pt` como `--model` para continuar fine-tuning incremental.

## 🔌 Integración con worker-ai

```bash
cp models/yolo11s_camera.onnx ../data/models/
# Actualizar model_path en la config del worker y reiniciar servicio.
```

## ⏱️ Tiempo estimado

- Extracción + anotado inicial: depende de tus datos  
- Entrenamiento GPU: ~5-10 min (dataset mediano)  
- Export + despliegue: <1 min  

Listo para presentar o seguir iterando sobre nuevas capturas.
