# Modelos ONNX

Este directorio contiene los modelos ONNX para el worker de IA.

## Descargar YOLOv8

```bash
# YOLOv8 Nano (más rápido, menor precisión)
wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.onnx

# YOLOv8 Small
wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8s.onnx

# YOLOv8 Medium
wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8m.onnx
```

## Convertir modelo PyTorch a ONNX

Si tienes un modelo custom en PyTorch:

```bash
pip install ultralytics

python3 << EOF
from ultralytics import YOLO

# Cargar modelo
model = YOLO('yolov8n.pt')

# Exportar a ONNX
model.export(format='onnx', dynamic=False, simplify=True)
EOF
```

## Verificar modelo

```bash
pip install onnx

python3 << EOF
import onnx

model = onnx.load('yolov8n.onnx')
onnx.checker.check_model(model)
print('Model is valid!')
EOF
```

## Modelos soportados

- YOLOv8 (n, s, m, l, x)
- YOLOv5 (convertido a ONNX)
- Modelos custom entrenados con Ultralytics

## Formato esperado

- Input: `[batch, 3, height, width]` (RGB, NCHW)
- Output: `[batch, num_predictions, 85]` (COCO 80 clases + bbox + conf)

## Tamaños recomendados

| Modelo | Tamaño | Velocidad | Precisión |
|--------|--------|-----------|-----------|
| yolov8n | 6 MB | ⚡⚡⚡ | ⭐⭐ |
| yolov8s | 22 MB | ⚡⚡ | ⭐⭐⭐ |
| yolov8m | 52 MB | ⚡ | ⭐⭐⭐⭐ |

Para edge deployment, recomendamos **yolov8n** o **yolov8s**.
