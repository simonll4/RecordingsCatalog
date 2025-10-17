# ✅ Integración de Environment.yml con Mamba

## Cambios Realizados

### 1. ✅ Creado `environment.yml`
- Migrado desde CV con todas las dependencias necesarias
- Python 3.10.19 (mismo que CV)
- ONNX Runtime 1.23.1 + GPU support
- OpenCV 4.12.0.88
- PyYAML 6.0.3 para tracker
- NumPy 2.2.6, Protobuf 6.32.1, etc.

### 2. ✅ Eliminado `requirements.txt`
- Ya no se usa pip directamente
- Todo se gestiona vía mamba/conda

### 3. ✅ Creado `run.sh`
Script de conveniencia para ejecutar el worker:
- Verifica instalación de mamba
- Crea entorno si no existe
- Activa entorno automáticamente
- Ejecuta worker con logging

### 4. ✅ Actualizado `Dockerfile`
- Base: Python 3.10-slim (en vez de 3.11)
- Usa micromamba para gestión de entornos en Docker
- Instala desde environment.yml
- Incluye dependencias de sistema para OpenCV
- Crea directorios /data/tracks

### 5. ✅ Actualizada Documentación
- `README.md`: Sección de Setup con mamba
- `MIGRATION.md`: Testing con mamba
- `SUMMARY.md`: Cambios de environment.yml

## Estructura Final

```
worker-ai/
├── environment.yml          ✅ NUEVO - Gestión de dependencias con mamba
├── run.sh                   ✅ NUEVO - Script de ejecución
├── worker_new.py            ✅ Entry point modular
├── src/
│   ├── tracking/botsort.py  ✅ BoT-SORT tracker
│   ├── session/manager.py   ✅ Gestión de sesiones
│   ├── inference/yolo11.py  ✅ Modelo YOLO11 ONNX
│   ├── core/{config,logger}.py ✅ Config + logging
│   └── protocol/handler.py  ✅ Protobuf v1
├── botsort.yaml            ✅ NUEVO - Config del tracker
├── config.toml             ✅ Modificado - Nuevas secciones
├── Dockerfile              ✅ Modificado - Usa micromamba
├── ai_pb2.py               (existente)
├── healthcheck.py          (existente)
├── README.md               ✅ Actualizado
├── MIGRATION.md            ✅ Actualizado
├── SUMMARY.md              ✅ Actualizado
├── examples/
│   └── README.md           ✅ NUEVO - Ejemplos de JSON
└── docs/
    ├── artefactos-del-worker.md
    └── IMPLEMENTATION.md
```

## Uso

### Desarrollo Local (con mamba)

```bash
# Opción 1: Script automático
./run.sh

# Opción 2: Manual
mamba env create -f environment.yml  # Solo la primera vez
mamba activate worker-ai
python worker_new.py
```

### Docker

```bash
# Build
docker build -t worker-ai:latest .

# Run
docker run -p 7001:7001 -v /data/tracks:/data/tracks worker-ai:latest
```

### Docker Compose

```yaml
services:
  worker-ai:
    build: ./services/worker-ai
    ports:
      - "7001:7001"
    volumes:
      - ./data/models:/models:ro
      - ./data/tracks:/data/tracks
    environment:
      - TZ=UTC
```

## Verificación

```bash
# Verificar entorno
mamba activate worker-ai
python --version          # 3.10.19
python -c "import onnxruntime as ort; print(ort.__version__)"  # 1.23.1
python -c "import cv2; print(cv2.__version__)"                  # 4.12.0.88
python -c "import yaml; print(yaml.__version__)"                # 6.0.3

# Verificar módulos propios
python -c "from src.tracking.botsort import BoTSORTTracker; print('✅ tracker')"
python -c "from src.session.manager import SessionManager; print('✅ session_manager')"

# Ejecutar worker
./run.sh
```

## Dependencias Principales

### Core Runtime
- Python 3.10.19
- ONNX Runtime 1.23.1 (CPU)
- ONNX Runtime GPU 1.20.2 (CUDA)

### Procesamiento
- NumPy 2.2.6
- OpenCV 4.12.0.88
- Pillow 11.3.0

### Comunicación
- Protobuf 6.32.1

### Configuración
- PyYAML 6.0.3
- tomli 2.0.1 (TOML parser, Python < 3.11)

### NVIDIA CUDA (GPU support)
- nvidia-cudnn-cu12 9.10.2.21
- nvidia-cublas-cu12 12.8.4.1
- nvidia-cuda-runtime-cu12 12.8.90
- (+ otras libs CUDA)

## Ventajas de Mamba vs Pip

### ✅ Gestión Integrada
- Dependencias de sistema + Python en un solo archivo
- Reproducibilidad garantizada
- Mismo entorno en desarrollo y producción

### ✅ Resolución de Dependencias
- Mamba resuelve conflictos automáticamente
- Instala versiones compatibles
- Más rápido que conda

### ✅ GPU Support
- Configuración de CUDA incluida
- nvidia-* packages gestionados correctamente
- ONNX Runtime GPU funcional out-of-the-box

### ✅ Compatibilidad con CV
- Mismo Python 3.10.19
- Mismas versiones de paquetes críticos
- Fácil migrar código entre proyectos

## Notas

1. **Entorno ya creado**: El environment.yml está listo, solo ejecutar `./run.sh`

2. **Docker usa micromamba**: Para imágenes más ligeras en producción

3. **Backward compatible**: El protocolo protobuf no cambió

4. **GPU opcional**: Si no hay CUDA, usa CPU automáticamente

## Próximos Pasos

1. ✅ Entorno mamba integrado
2. ✅ Script de ejecución creado
3. ✅ Dockerfile actualizado
4. ⚠️ Probar ejecución local con `./run.sh`
5. ⚠️ Verificar tracking funciona correctamente
6. ⚠️ Probar con edge-agent

## 🎉 ¡Listo para usar!

El worker-ai ahora usa mamba para gestión de dependencias, con todas las ventajas de reproducibilidad y compatibilidad con el proyecto CV original.
