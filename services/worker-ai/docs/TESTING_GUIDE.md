# Guía de Testing - Worker AI Refactorizado

## 🔧 Prerequisitos

Asegúrate de tener el entorno configurado:

```bash
# Conda/Mamba
conda env create -f environment.yml
conda activate worker-ai

# O con mamba (más rápido)
mamba env create -f environment.yml
mamba activate worker-ai
```

## 🚀 Ejecución del Worker

```bash
# Opción 1: Directamente con Python
python worker.py

# Opción 2: Con el script de conveniencia (recomendado)
./run.sh
```

Salida esperada:
```
🤖 Worker AI - Starting...

📝 Usando config.local.toml (desarrollo local)
🚀 Worker AI escuchando en 0.0.0.0:7001
📁 Output tracks: /path/to/data/tracks
```

## 🧪 Tests Unitarios (Próximos Pasos)

### Estructura Sugerida

```
tests/
├── __init__.py
├── test_transport/
│   ├── test_framing.py
│   └── test_protobuf_codec.py
├── test_pipeline/
│   ├── test_frame_decoder.py
│   ├── test_model_manager.py
│   ├── test_tracking_service.py
│   ├── test_session_service.py
│   └── test_processor.py
└── test_server/
    ├── test_heartbeat.py
    └── test_model_loader.py
```

### Ejemplo: test_frame_decoder.py

```python
import pytest
import numpy as np
import cv2
from src.pipeline.frame_decoder import FrameDecoder
import ai_pb2 as pb

def test_decode_jpeg():
    decoder = FrameDecoder()
    
    # Crear imagen de prueba
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    _, jpeg_data = cv2.imencode('.jpg', img)
    
    # Decodificar
    result = decoder.decode(
        jpeg_data.tobytes(),
        codec=pb.CODEC_JPEG,
        pixel_format=pb.PF_UNKNOWN,
        width=640,
        height=480
    )
    
    assert result is not None
    assert result.shape == (480, 640, 3)

def test_decode_invalid_format():
    decoder = FrameDecoder()
    
    result = decoder.decode(
        b"invalid data",
        codec=999,  # Codec inválido
        pixel_format=999,
        width=640,
        height=480
    )
    
    assert result is None
```

### Ejemplo: test_model_manager.py

```python
import pytest
import asyncio
from src.pipeline.model_manager import ModelManager

@pytest.mark.asyncio
async def test_model_pooling():
    manager = ModelManager()
    
    # Primera carga
    model1 = await manager.load("models/yolo11s.onnx")
    assert model1 is not None
    
    # Segunda carga (debe retornar del pool)
    model2 = await manager.load("models/yolo11s.onnx")
    assert model2 is model1  # Misma instancia
    
    # Verificar que está en el pool
    cached = manager.get("models/yolo11s.onnx")
    assert cached is model1
```

### Ejemplo: test_processor.py

```python
import pytest
from unittest.mock import Mock, MagicMock
from src.pipeline.processor import FrameProcessor
from src.pipeline.dto import FramePayload
import ai_pb2 as pb

def test_process_frame_without_session():
    # Crear mocks
    decoder = Mock()
    model_manager = Mock()
    tracking_service = Mock()
    session_service = Mock()
    
    # Configurar mocks
    decoder.decode.return_value = np.zeros((480, 640, 3), dtype=np.uint8)
    model_manager.infer.return_value = []
    tracking_service.enabled = False
    session_service.is_active.return_value = False
    
    # Crear processor
    processor = FrameProcessor(
        decoder=decoder,
        model_manager=model_manager,
        tracking_service=tracking_service,
        session_service=session_service
    )
    processor.set_model("test_model.onnx")
    
    # Crear payload
    payload = FramePayload(
        session_id=None,
        frame_id=1,
        codec=pb.CODEC_JPEG,
        pixel_format=pb.PF_UNKNOWN,
        width=640,
        height=480,
        data=b"fake_jpeg_data"
    )
    
    # Procesar
    result = processor.process_frame(payload)
    
    # Verificar
    assert result is not None
    assert result.frame_id == 1
    assert result.tracking_active == False
    decoder.decode.assert_called_once()
    model_manager.infer.assert_called_once()
```

## 🔍 Testing Manual con Edge Agent

1. Iniciar worker:
```bash
python worker.py
```

2. En otra terminal, ejecutar edge-agent:
```bash
cd ../edge-agent
python edge_agent.py
```

3. Verificar logs del worker:
```
Cliente conectado: ('127.0.0.1', 54321)
Init recibido: model=models/yolo11s.onnx
Iniciando carga de modelo: models/yolo11s.onnx
Modelo cargado exitosamente: models/yolo11s.onnx
InitOk enviado
Frame recibido: session=test_session_001, frame_id=1
...
```

4. Verificar salida de tracks:
```bash
ls -la data/tracks/test_session_001/
# Debe contener: index.json, meta.json, tracks/
```

## 📊 Métricas de Calidad

### Coverage (cuando se implementen tests)

```bash
pytest --cov=src --cov-report=html
```

### Linting

```bash
# Verificar estilo
pylint src/

# Formatear código
black src/
```

### Type Checking

```bash
mypy src/
```

## 🐛 Debugging

### Logs Detallados

Modificar `src/core/logger.py` para nivel DEBUG:

```python
logging.basicConfig(
    level=logging.DEBUG,  # Cambiar de INFO a DEBUG
    ...
)
```

### Breakpoints

Usar `breakpoint()` en cualquier módulo:

```python
# En src/pipeline/processor.py
def process_frame(self, payload):
    breakpoint()  # Pausará aquí
    img = self.decoder.decode(...)
```

### Profiling

```bash
# Perfilar performance
python -m cProfile -o worker.prof worker.py

# Analizar resultados
python -m pstats worker.prof
```

## ✅ Checklist de Verificación

- [ ] `test_imports.py` pasa sin errores
- [ ] Worker inicia correctamente
- [ ] Edge agent puede conectarse
- [ ] Frames se procesan correctamente
- [ ] Sesiones se persisten en JSON
- [ ] Visualización funciona (si está habilitada)
- [ ] Shutdown limpio con Ctrl+C

## 🎯 Próximos Pasos

1. Implementar tests unitarios para cada módulo
2. Agregar tests de integración
3. Configurar CI/CD con GitHub Actions
4. Agregar coverage mínimo del 80%
5. Documentar casos edge y errores conocidos
