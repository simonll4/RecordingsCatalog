#!/usr/bin/env python3
"""
Crea un modelo ONNX dummy para testing sin necesidad de descargar YOLOv8
Este modelo no hace inferencia real, solo sirve para probar la conectividad TCP
"""
import numpy as np
try:
    import onnx
    from onnx import helper, TensorProto
except ImportError:
    print("ERROR: onnx no está instalado")
    print("Instala con: pip install onnx")
    import sys
    sys.exit(1)

print("Creando modelo ONNX dummy para testing...")

# Input: 1x3x640x640 (batch, channels, height, width)
input_shape = [1, 3, 640, 640]
output_shape = [1, 84, 8400]  # YOLOv8 format: [batch, 84=(80 classes + 4 bbox), 8400 anchors]

# Crear nodos
input_tensor = helper.make_tensor_value_info('images', TensorProto.FLOAT, input_shape)
output_tensor = helper.make_tensor_value_info('output0', TensorProto.FLOAT, output_shape)

# Nodo Identity (passthrough) - no hace nada útil, solo para testing
# En realidad necesitamos un reshape para cambiar dimensiones
weights = np.zeros((84, 3, 640, 640), dtype=np.float32).flatten()
weights_tensor = helper.make_tensor('dummy_weights', TensorProto.FLOAT, [84 * 3 * 640 * 640], weights)

node = helper.make_node(
    'Constant',
    inputs=[],
    outputs=['output0'],
    value=helper.make_tensor('const', TensorProto.FLOAT, output_shape, np.zeros(output_shape).flatten())
)

# Crear grafo
graph = helper.make_graph(
    [node],
    'dummy_yolo',
    [input_tensor],
    [output_tensor],
)

# Crear modelo
model = helper.make_model(graph, producer_name='dummy-yolo-generator')
model.opset_import[0].version = 13

# Guardar
output_path = 'services/worker-ai/yolov8n-dummy.onnx'
onnx.save(model, output_path)

print(f"✓ Modelo dummy creado: {output_path}")
print("NOTA: Este modelo NO hace inferencia real, solo sirve para testing de conectividad")
print("Para producción, descarga el modelo real de YOLOv8")
