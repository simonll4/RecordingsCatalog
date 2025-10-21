# Sistema de Logging Configurable

## 📋 Niveles de Log

El edge-agent usa 4 niveles de logging jerárquicos:

| Nivel   | Qué muestra                | Cuándo usar                      |
| ------- | -------------------------- | -------------------------------- |
| `error` | Solo errores críticos      | Producción (mínimo ruido)        |
| `warn`  | Warnings + errores         | Producción (alertas importantes) |
| `info`  | Info + warn + error        | Desarrollo/Staging (default)     |
| `debug` | Todo (incluye eventos FSM) | Debugging detallado              |

## ⚙️ Configuración

### Configuración en `config.toml`

```toml
[logging]
level = "info"  # Opciones: debug | info | warn | error
```

### Cambiar nivel de logging

```bash
# Editar config.toml y cambiar el nivel:
vim config.toml

# [logging]
# level = "debug"  # debug | info | warn | error

# Luego reiniciar:
npm run dev
```

## 📊 Qué Loguea Cada Nivel

### `error` (Mínimo)

```
✅ Errores de conexión (camera, store, RTSP)
✅ Timeouts críticos
✅ Fallos de encoding/decoding
✅ Crashes de procesos hijos
```

### `warn` (Producción recomendado)

```
✅ Todo de error +
✅ Backpressure en bus (drops)
✅ Fallbacks (MJPEG → RAW)
✅ Reintentos de conexión
✅ Shutdown timeout warnings
```

### `info` (Development - DEFAULT)

```
✅ Todo de warn +
✅ Startup/shutdown del agente
✅ Cambios de estado FSM (IDLE → ACTIVE)
✅ Sesiones (open/close)
✅ Publisher start/stop
✅ Camera ready
```

### `debug` (Debugging detallado)

```
✅ Todo de info +
✅ Cada evento FSM recibido
✅ Comandos ejecutados (Start/StopStream, Open/CloseSession, SetAIFpsMode)
✅ Flush de batches al store
✅ Frames recibidos por AI capture
✅ Keepalives del AI engine
```

## 📝 Ejemplos de Salida

### Con `level = "info"` en config.toml (Limpio)

```
2025-10-05T06:30:00.000Z [INFO ] === Edge Agent Starting === | module="main"
2025-10-05T06:30:00.100Z [INFO ] Camera hub ready | module="camera-hub"
2025-10-05T06:30:00.200Z [INFO ] Orchestrator ready | module="orchestrator" state="IDLE"
2025-10-05T06:30:05.000Z [INFO ] FSM state change | module="orchestrator" from="IDLE" to="DWELL"
2025-10-05T06:30:05.500Z [INFO ] FSM state change | module="orchestrator" from="DWELL" to="ACTIVE"
2025-10-05T06:30:05.501Z [INFO ] Starting publisher | module="publisher" encoder="x264enc"
2025-10-05T06:30:05.502Z [INFO ] Opening session | module="session-store" sessionId="sess_1728112205502_1"
2025-10-05T06:30:25.000Z [INFO ] FSM state change | module="orchestrator" from="ACTIVE" to="CLOSING"
2025-10-05T06:30:30.000Z [INFO ] FSM state change | module="orchestrator" from="CLOSING" to="IDLE"
2025-10-05T06:30:30.001Z [INFO ] Stopping publisher | module="publisher"
2025-10-05T06:30:30.100Z [INFO ] Publisher stopped | module="publisher"
2025-10-05T06:30:30.101Z [INFO ] Closing session | module="session-store" sessionId="sess_1728112205502_1"
```

### Con `level = "debug"` en config.toml (Completo pero ruidoso)

```
2025-10-05T06:30:00.000Z [INFO ] === Edge Agent Starting === | module="main"
2025-10-05T06:30:00.001Z [DEBUG] Validating config | module="camera-hub"
2025-10-05T06:30:00.050Z [DEBUG] GStreamer process spawned | module="camera-hub" pid=12345
2025-10-05T06:30:00.100Z [INFO ] Camera hub ready | module="camera-hub"
2025-10-05T06:30:05.000Z [DEBUG] Event received | module="orchestrator" event="ai.detection" state="IDLE"
2025-10-05T06:30:05.000Z [INFO ] FSM state change | module="orchestrator" from="IDLE" to="DWELL"
2025-10-05T06:30:05.100Z [DEBUG] Event received | module="orchestrator" event="ai.keepalive" state="DWELL"
2025-10-05T06:30:05.100Z [DEBUG] FSM no state change | module="orchestrator" state="DWELL" commands=0
2025-10-05T06:30:05.500Z [DEBUG] Event received | module="orchestrator" event="fsm.t.dwell.ok" state="DWELL"
2025-10-05T06:30:05.500Z [INFO ] FSM state change | module="orchestrator" from="DWELL" to="ACTIVE"
2025-10-05T06:30:05.501Z [DEBUG] Executing command | module="orchestrator" command="StartStream"
2025-10-05T06:30:05.501Z [INFO ] Starting publisher | module="publisher" encoder="x264enc"
2025-10-05T06:30:05.502Z [DEBUG] Executing command | module="orchestrator" command="OpenSession"
2025-10-05T06:30:05.502Z [INFO ] Opening session | module="session-store" sessionId="sess_1728112205502_1"
2025-10-05T06:30:06.000Z [DEBUG] Event received | module="orchestrator" event="ai.detection" state="ACTIVE"
2025-10-05T06:30:06.000Z [DEBUG] FSM no state change | module="orchestrator" state="ACTIVE" commands=0
2025-10-05T06:30:06.010Z [DEBUG] Frame + detections ingested | module="main" sessionId="sess_..." seqNo=12 detections=1
... (continúa con cada detección) ...
```

## 🎯 Recomendaciones

### Durante Desarrollo

```toml
# config.toml
[logging]
level = "info"
```

- Ves cambios de estado importantes
- No te ahoga en eventos
- Puedes seguir el flujo de sesiones

### Para Debugging

```toml
# config.toml
[logging]
level = "debug"
```

- Ves CADA evento y comando
- Útil para entender por qué algo no funciona
- Verifica que FSM recibe eventos correctos

### En Producción (Docker)

```toml
# config.toml
[logging]
level = "warn"
```

- Solo alertas importantes
- Reduce I/O de logs
- Fácil spot de problemas

### Troubleshooting Específico

#### "No se está grabando"

```bash
# Configurar level = "debug" en config.toml primero
npm run dev | grep -E "(FSM|detection|session)"
```

#### "Publisher no arranca"

```bash
# Configurar level = "debug" en config.toml primero
npm run dev | grep -E "(publisher|encoder)"
```

#### "Camera no conecta"

```bash
# Configurar level = "debug" en config.toml primero
npm run dev | grep -E "(camera|ready|socket)"
```

## 🔧 Cambiar Nivel en Runtime

Actualmente NO soportado (requiere reinicio). Para implementar:

```typescript
// En futuro: endpoint HTTP para cambiar nivel
app.post("/admin/log-level", (req, res) => {
  const level = req.body.level;
  logger.setLevel(level);
  res.json({ ok: true, level });
});
```

## 📦 Integración con Docker

En `docker-compose.yml`:

```yaml
services:
  edge-agent:
    volumes:
      - ./config.toml:/app/config.toml:ro  # Montar config custom
```

Opciones:

```bash
# 1. Editar config.toml directamente (recomendado)
vim services/edge-agent/config.toml
# [logging]
# level = "debug"  # o "info", "warn", "error"

# 2. Rebuild container si cambias config.toml
docker compose --profile edge up --build
```

## 🎨 Formato de Logs

Todos los logs siguen el formato estructurado:

```
<timestamp> [<LEVEL>] <message> | key1=value1 key2=value2 ...
```

Ejemplo:

```
2025-10-05T06:30:05.500Z [INFO ] FSM state change | module="orchestrator" from="IDLE" to="ACTIVE" commands=2
```

Campos comunes:

- `module` - Módulo que genera el log (camera-hub, orchestrator, etc.)
- `state` - Estado FSM actual
- `sessionId` - ID de sesión activa
- `error` - Mensaje de error (solo en errores)
- `attempt` - Número de intento (en retries)

## ✨ Mejoras Futuras

1. **Log rotation** - Archivar logs antiguos
2. **Structured JSON** - Para parseo automático (ELK, Loki)
3. **Performance metrics en logs** - CPU, memoria, latency
4. **Log sampling** - En debug, samplear 1 de cada N eventos
5. **Dynamic level** - Cambiar sin reiniciar vía HTTP endpoint
