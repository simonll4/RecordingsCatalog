# 🛠️ Scripts del Worker AI

Utilidades para trabajar con el worker AI.

## 📜 Scripts Disponibles

### 1. `export_yolo11s_to_onnx.py`

Descarga automáticamente `yolo11s.pt` y lo exporta a ONNX (con NMS integrado por defecto).

```bash
python scripts/export_yolo11s_to_onnx.py
```

Genera `data/models/yolo11s.onnx`, listo para el worker.

---

### 2. `export_yolo_to_onnx.py`

Exporta modelos YOLO desde formato `.pt` a `.onnx` para uso con ONNX Runtime.

**Uso básico**:
```bash
# Con NMS integrado (recomendado para producción)
python scripts/export_yolo_to_onnx.py --weights yolo11s.pt --nms

# Sin NMS (para desarrollo/experimentación)
python scripts/export_yolo_to_onnx.py --weights yolo11s.pt
```

**Documentación completa**: Ver `../EXPORTAR_MODELOS.md`

---

### 3. `annotate_from_json.py`

Anota frames usando datos de tracking almacenados en archivos JSON.

**Propósito**: Generar overlays de detecciones sobre grabaciones de video a partir de los tracks guardados en sesiones.

---

## 📚 Ver También

- **`../EXPORTAR_MODELOS.md`** - Guía completa de exportación de modelos
- **`../QUICKSTART.md`** - Inicio rápido del worker
- **`../test_detection.py`** - Test de inferencia YOLO
- **`../inspect_model.py`** - Inspeccionar formato de modelos ONNX
