#!/usr/bin/env python3
"""
Script para exportar YOLOv8n a formato ONNX usando ultralytics
"""
import sys

try:
    from ultralytics import YOLO
except ImportError:
    print("ERROR: ultralytics no está instalado")
    print("Instala con: pip install ultralytics")
    sys.exit(1)

print("Descargando y exportando YOLOv8n a ONNX...")
print("Esto descargará ~6MB del modelo PyTorch y lo convertirá a ONNX")

# Cargar modelo pre-entrenado (descarga automáticamente)
model = YOLO('yolov8n.pt')

# Exportar a ONNX
model.export(format='onnx', imgsz=640, simplify=True)

print("✓ Modelo exportado: yolov8n.onnx")
print("Mueve el archivo a: services/worker-ai/yolov8n.onnx")
