# Arquitectura Worker AI - Post Refactorización

## Flujo de Procesamiento de un Frame

```
1. Edge Agent → TCP → FrameReader.read_frame()
                          ↓
2. ProtobufCodec.decode_envelope() → EnvelopeData
                          ↓
3. ConnectionHandler._handle_frame()
                          ↓
4. FrameProcessor.process_frame()
   ├─ FrameDecoder.decode() → numpy array
   ├─ ModelManager.infer() → List[Detection]
   ├─ TrackingService.update() → List[Track]
   └─ SessionService.append() → Persiste JSON
                          ↓
5. FrameResult → ProtobufCodec.encode_result()
                          ↓
6. FrameWriter.write_frame() → TCP → Edge Agent
```

## Separación de Responsabilidades

### Transport Layer (src/transport/)
- **Responsabilidad**: Comunicación TCP y serialización Protobuf
- **Módulos**: framing.py, protobuf_codec.py
- **No conoce**: Lógica de visión, modelos, tracking

### Pipeline Layer (src/pipeline/)
- **Responsabilidad**: Procesamiento de frames
- **Módulos**: dto.py, frame_decoder.py, model_manager.py, tracking_service.py, session_service.py, processor.py
- **No conoce**: TCP, protobuf, conexiones

### Server Layer (src/server/)
- **Responsabilidad**: Coordinación y gestión de conexiones
- **Módulos**: server.py, connection.py, heartbeat.py, model_loader.py
- **Conecta**: Transport + Pipeline

### Configuration Layer (src/config/)
- **Responsabilidad**: Settings centralizados
- **Módulos**: base.py, runtime.py
- **Proporciona**: Parámetros para todas las capas

## Ventajas de la Arquitectura

1. **Testabilidad**: Cada capa puede testearse independientemente
2. **Mantenibilidad**: Cambios localizados en módulos específicos
3. **Extensibilidad**: Nuevas funcionalidades sin modificar existentes
4. **Reusabilidad**: Pipeline puede usarse fuera de TCP
5. **Claridad**: Responsabilidades bien definidas
