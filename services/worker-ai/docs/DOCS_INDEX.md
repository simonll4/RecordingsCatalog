# 📚 Índice de Documentación - Worker AI

Guía rápida para encontrar la documentación que necesitas.

---

## 🚀 Primeros Pasos

### Para Nuevos Usuarios

1. **[ESTADO_FINAL.md](ESTADO_FINAL.md)** ⭐  
   Estado actual del proyecto, qué se hizo y cómo usarlo

2. **[QUICKSTART.md](QUICKSTART.md)** ⭐  
   Inicio rápido: instalación, configuración, ejecución

3. **[README.md](README.md)**  
   Resumen general del proyecto

---

## 🔧 Guías Operativas

### Trabajar con Modelos

- **[EXPORTAR_MODELOS.md](EXPORTAR_MODELOS.md)**  
  Cómo exportar modelos YOLO a ONNX (con/sin NMS)
  
- **[scripts/README.md](scripts/README.md)**  
  Scripts disponibles y cómo usarlos

### Uso Diario

- **[QUICKSTART.md](QUICKSTART.md)**  
  Cómo iniciar el worker, configuración básica

- **`config.local.toml`**  
  Archivo de configuración (editar según necesidad)

---

## 🐛 Troubleshooting

### Si algo no funciona

1. **[FIX_NMS_INTEGRADO.md](FIX_NMS_INTEGRADO.md)**  
   Problema específico de modelos con NMS integrado (ya resuelto)

2. **[QUICKSTART.md](QUICKSTART.md)** → Sección "Troubleshooting"  
   Problemas comunes y soluciones

3. **Tests y Verificación**:
   - `python test_detection.py` - Verifica inferencia
   - `python inspect_model.py` - Inspecciona modelo

---

## 📖 Documentación Técnica

### Arquitectura y Diseño

- **[REORGANIZATION_NOTES.md](REORGANIZATION_NOTES.md)**  
  Cambios aplicados, arquitectura, flujo del sistema

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**  
  Arquitectura detallada (si existe)

### Desarrollo

- **[docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md)**  
  Testing, debugging, profiling

- **[docs/REFACTORING_SUMMARY.md](docs/REFACTORING_SUMMARY.md)**  
  Historial de refactoring

---

## 🛠️ Scripts y Utilidades

### Scripts Principales

1. **`scripts/export_yolo_to_onnx.py`**  
   Exportar modelos YOLO (.pt → .onnx)
   ```bash
   python scripts/export_yolo_to_onnx.py --weights yolo11s.pt --nms
   ```

2. **`test_detection.py`**  
   Test básico de inferencia YOLO
   ```bash
   python test_detection.py
   ```

3. **`inspect_model.py`**  
   Inspeccionar formato y metadata de modelos ONNX
   ```bash
   python inspect_model.py
   ```

4. **`scripts/annotate_from_json.py`**  
   Anotar frames con tracking guardado

Ver [scripts/README.md](scripts/README.md) para más detalles.

---

## 📋 Por Caso de Uso

### "Quiero empezar rápido"
1. [ESTADO_FINAL.md](ESTADO_FINAL.md) - Estado actual
2. [QUICKSTART.md](QUICKSTART.md) - Inicio rápido
3. Ejecutar: `./run.sh`

### "Necesito exportar un modelo YOLO"
1. [EXPORTAR_MODELOS.md](EXPORTAR_MODELOS.md) - Guía completa
2. Ejecutar: `python scripts/export_yolo_to_onnx.py --help`

### "Las detecciones no funcionan"
1. [QUICKSTART.md](QUICKSTART.md) → Troubleshooting
2. Ejecutar: `python test_detection.py`
3. Ejecutar: `python inspect_model.py`
4. Revisar: `config.local.toml` (filtro de clases)

### "Quiero entender cómo funciona"
1. [REORGANIZATION_NOTES.md](REORGANIZATION_NOTES.md) - Arquitectura
2. [FIX_NMS_INTEGRADO.md](FIX_NMS_INTEGRADO.md) - Detalle técnico
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - Arquitectura completa

### "Quiero contribuir/modificar código"
1. [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) - Testing
2. [REORGANIZATION_NOTES.md](REORGANIZATION_NOTES.md) - Estructura
3. Código fuente en `src/`

---

## 🗂️ Organización de Archivos

```
worker-ai/
├── 📘 ESTADO_FINAL.md          ⭐ Estado actual y resumen
├── 📘 QUICKSTART.md            ⭐ Inicio rápido
├── 📘 EXPORTAR_MODELOS.md      🔧 Exportar modelos
├── 📘 FIX_NMS_INTEGRADO.md     🐛 Fix técnico
├── 📘 REORGANIZATION_NOTES.md  🏗️ Arquitectura
├── 📘 DOCS_INDEX.md            📚 Este archivo
├── 📘 README.md                📖 Overview general
│
├── 📁 docs/                    📚 Documentación técnica
│   ├── ARCHITECTURE.md
│   ├── TESTING_GUIDE.md
│   └── ...
│
├── 📁 scripts/                 🛠️ Utilidades
│   ├── export_yolo_to_onnx.py
│   ├── annotate_from_json.py
│   └── README.md
│
├── 🔧 test_detection.py        Test de inferencia
├── 🔧 inspect_model.py         Inspeccionar modelos
├── ⚙️ config.local.toml        Configuración
└── 🚀 worker.py                Entry point
```

---

## 📌 Documentos por Categoría

### ⭐ Esenciales (Lee estos primero)
- `ESTADO_FINAL.md`
- `QUICKSTART.md`
- `README.md`

### 🔧 Operativos
- `EXPORTAR_MODELOS.md`
- `config.local.toml`
- `scripts/README.md`

### 🐛 Fixes y Troubleshooting
- `FIX_NMS_INTEGRADO.md` - Fix de detección con NMS
- `FIX_SINCRONIZACION_VIDEO.md` - Fix de sincronización anotaciones-video
- `QUICKSTART.md` (sección Troubleshooting)

### 🏗️ Arquitectura y Diseño
- `REORGANIZATION_NOTES.md`
- `docs/ARCHITECTURE.md`

### 🧪 Testing y Desarrollo
- `docs/TESTING_GUIDE.md`
- `test_detection.py`
- `inspect_model.py`

---

## 🔍 Búsqueda Rápida

| Quiero... | Ver documento... |
|-----------|------------------|
| Empezar | [QUICKSTART.md](QUICKSTART.md) |
| Exportar modelo | [EXPORTAR_MODELOS.md](EXPORTAR_MODELOS.md) |
| Fix detección | [FIX_NMS_INTEGRADO.md](FIX_NMS_INTEGRADO.md) |
| Fix sincronización | [FIX_SINCRONIZACION_VIDEO.md](FIX_SINCRONIZACION_VIDEO.md) |
| Ver arquitectura | [REORGANIZATION_NOTES.md](REORGANIZATION_NOTES.md) |
| Configurar | `config.local.toml` |
| Testing | [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) |
| Scripts | [scripts/README.md](scripts/README.md) |
| Estado actual | [ESTADO_FINAL.md](ESTADO_FINAL.md) |

---

## 📞 ¿Necesitas Ayuda?

1. **Busca en este índice** el tema que necesitas
2. **Lee el documento correspondiente**
3. **Usa los scripts de testing** para verificar
4. **Revisa los logs** del worker para errores específicos

---

**Última actualización**: 2025-10-18  
**Versión**: Worker AI v1.0 (Reorganizado)
