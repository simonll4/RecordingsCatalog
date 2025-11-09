# Protocolo Protobuf – Contexto General

Este documento complementa `services/edge-agent/docs/PROTOCOL_V1.md` con una visión más narrativa del protocolo gRPC-like que usa el edge-agent para hablar con el `worker-ai`. Se divide en tres partes: una introducción breve a Protocol Buffers, los motivos por los que se eligió, y cómo se diseñó el protocolo binario actual.

## 1. ¿Qué es Protocol Buffers?

Protocol Buffers (Protobuf) es el formato binario de serialización de Google. Sus características más relevantes para nuestro stack son:

- **Schema-first**: se definen `.proto` files con mensajes y tipos fuertes. El compilador genera código para distintos lenguajes manteniendo compatibilidad binaria entre versiones.
- **Compacto y eficiente**: codifica enteros con varints y sólo transmite campos presentes, reduciendo el ancho de banda versus JSON o XML.
- **Backward/Forward compatible**: se pueden agregar campos opcionales sin romper clientes antiguos, mientras se respeten los tags numéricos.
- **Cross-language**: existen bindings oficiales y de terceros para C/C++, Go, Python, Node.js, Rust, etc., lo cual permite que nuestro edge (Node.js/TypeScript) y worker (Python) compartan las mismas definiciones.

## 2. ¿Por qué elegimos Protobuf para el edge-agent?

| Requisito | Protobuf nos aporta |
| --- | --- |
| Enviar frames y resultados de IA con baja latencia | Mensajes binarios pequeños y parseo rápido comparado con formatos de texto. |
| Coexistencia Node.js ↔ Python | Generador oficial de tipos para ambos runtimes; evitamos construir codificadores manuales. |
| Evolucionar el protocolo sin cortar el servicio | Podemos introducir nuevos campos (ej. `latency_breakdown`, `window_update`) sin sincronizar deployments al mismo tiempo. |
| Control estricto sobre los bytes enviados | La combinación de framing length-prefixed + Protobuf evita ambigüedades de delimitar mensajes sobre TCP. |
| Observabilidad | Al definir mensajes explícitos sabemos qué métricas/telemetría puede reportar el worker (ej. `Result.lat`). |

Alternativas consideradas (JSON sobre WS, gRPC streaming, FlatBuffers) se descartaron porque aumentaban overhead, dependían de HTTP/2 o complicaban la integración con GStreamer.

## 3. Cómo se armó el protocolo Protobuf en este sistema

El protocolo actual (v1) está descrito en profundidad en `services/edge-agent/docs/PROTOCOL_V1.md`, pero el resumen conceptual es:

1. **Canal TCP length-prefixed**: cada mensaje se envía como `<uint32_le length><payload>`, garantizando que ambas partes sepan dónde termina un mensaje incluso sobre TCP.
2. **Envelope Protobuf**: todos los mensajes viajan dentro de `Envelope { uint32 protocol_version; string stream_id; MsgType msg_type; bytes payload; }`, lo que permite multiplexar futuros streams y validar compatibilidad.
3. **Handshake Init / InitOk**:
   - Edge → Worker (`Init`): declara modelo, formatos admitidos (NV12/I420), códec (`RAW`/`JPEG`), resolución máxima y parámetros de la ventana (`max_inflight`).
   - Worker → Edge (`InitOk`): confirma la configuración elegida (pixel_format, codec, width/height) y concede créditos iniciales para el flujo `LATEST_WINS`.
4. **Transporte de frames**: `Frame` lleva `frame_id`, timestamps monotónicos, dimensiones y datos (sin comprimir o JPEG). Se alinea con la `FrameCache` para correlacionar `Result` → `frame_id`.
5. **Resultados y control de flujo**:
   - `Result`: contiene detecciones (cls/conf/bbox/trackId) y tiempos parciales (`lat_pre`, `lat_infer`, `lat_post`).
   - `WindowUpdate` y `End` controlan la política LATEST_WINS, evitando saturar al worker.
6. **Heartbeats**: ambos extremos envían `HEARTBEAT` periódicos (~2 s) para detectar desconexiones y disparar reconexiones con backoff.

Este diseño mantiene al worker completamente desacoplado del resto del sistema: sólo necesita entender el contrato Protobuf y responder dentro de los límites declarados en `InitOk`.

## 4. Importancia dentro de la arquitectura

- **Performance**: Protobuf reduce `CPU/byte` y `bandwidth/frame`, lo que permite sostener FPS altos en hardware modesto (Jetson, mini PCs) sin sacrificar latencia.
- **Seguridad y robustez**: al validar `protocol_version` y `msg_type` evitamos consumir basura; si algo se corrompe podemos descartar el paquete completo sin afectar la sesión.
- **Observabilidad y control**: los campos de `Result` alimentan el bus de eventos (`ai.detection`, `ai.keepalive`), que a su vez gobierna la FSM, las sesiones y los publishers RTSP.
- **Escalabilidad**: el mismo contrato soporta múltiples cámaras/workers con mínimas variaciones (basta cambiar `stream_id` y los parámetros de Init).

En resumen, Protocol Buffers no es sólo un formato de datos: es el pegamento que sincroniza captura, IA y orquestación en tiempo real. Documentar su contexto en `/docs` ayuda a que equipos fuera del edge-agent (worker-ai, backend o data science) entiendan las garantías y restricciones que deben respetar.
