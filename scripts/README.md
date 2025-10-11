# Scripts de Inicialización y Ejecución

Este directorio contiene scripts para configurar y ejecutar el sistema de grabación y catálogo de videos.

## Scripts Disponibles

### 1. `setup-host-timezone.sh`
Configura la zona horaria del host a UTC y habilita la sincronización automática de tiempo.

**Ejecutar UNA SOLA VEZ con permisos de administrador:**
```bash
sudo ./scripts/setup-host-timezone.sh
```

### 2. `setup-and-up.sh`
Instala dependencias, compila los servicios Node.js/TypeScript y levanta los contenedores.

```bash
./scripts/setup-and-up.sh
```

**Servicios incluidos:**
- `session-store` - API de sesiones y detecciones
- `edge-agent` - Agente edge con IA
- `web-ui` - Interfaz web

### 3. `verify-timezone-sync.sh`
Verifica que todos los contenedores estén sincronizados en UTC.

```bash
./scripts/verify-timezone-sync.sh
```

### 4. `run-edge-local.sh`
Ejecuta el agente de edge **localmente** (fuera de Docker) para desarrollo y pruebas.

```bash
# Ejecución básica (usa configuración de .env)
./scripts/run-edge-local.sh

# Con cámara específica
./scripts/run-edge-local.sh --camera-device=/dev/video1

# Forzar uso de cámara /dev/video0
./scripts/run-edge-local.sh --with-camera

# Sin cámara (usa defaults del .env)
./scripts/run-edge-local.sh --no-camera
```
**Requisitos:**
- GStreamer instalado
- Build compilado (`npm run build` en edge-agent)
- Session-store y MediaMTX corriendo

### 5. `run-edge-docker.sh` ✨ NUEVO
Ejecuta el agente de edge con **Docker Compose** usando el profile `edge`.

```bash
# Iniciar edge-agent (detached)
./scripts/run-edge-docker.sh up

# Iniciar con rebuild
./scripts/run-edge-docker.sh up --build

# Iniciar en foreground (ver logs directamente)
./scripts/run-edge-docker.sh up --foreground

# Ver logs
./scripts/run-edge-docker.sh logs

# Ver estado
./scripts/run-edge-docker.sh ps

# Detener
./scripts/run-edge-docker.sh stop

# Reiniciar
./scripts/run-edge-docker.sh restart

# Bajar todo
./scripts/run-edge-docker.sh down
```

## 🚀 Flujo de Inicio Completo

### Primera Vez

```bash
# 1. Configurar timezone del host (solo una vez)
sudo ./scripts/setup-host-timezone.sh

# 2. Instalar, compilar y levantar servicios
./scripts/setup-and-up.sh

# 3. Verificar timezone
./scripts/verify-timezone-sync.sh

# 4. Levantar edge-agent
./scripts/run-edge-docker.sh up --build
```

### 6. `test-integration.sh` ✨
Ejecuta un test de integración completo del session-store verificando sesiones y detecciones.

```bash
# Primero asegurarse que el session-store esté corriendo
docker-compose up -d session-store

# Ejecutar test
./scripts/test-integration.sh
```

**El test verifica:**
- Health check del session-store
- Creación de sesión
- Batch insert de detecciones
- Consulta de detecciones por sesión
- Cierre de sesión
- Verificación de datos

### Desarrollo

```bash
# Opción A: Edge-agent local (más rápido para desarrollo)
./scripts/run-edge-local.sh

# Opción B: Edge-agent en Docker
./scripts/run-edge-docker.sh up --fg
```

## 📊 Verificación

### Session Store - Sesiones
```bash
curl http://localhost:8080/sessions | jq
```

### Session Store - Detecciones
```bash
# Por sesión
curl http://localhost:8080/detections/session/sess_xxx | jq

# Por rango de tiempo
curl "http://localhost:8080/detections/range?from=2025-10-03T00:00:00Z&to=2025-10-03T23:59:59Z" | jq
```

### MediaMTX
```bash
curl http://localhost:8888/v3/paths/list | jq
```

### Edge Agent (Docker)
```bash
docker-compose logs -f edge-agent
```

### Web UI
Abrir: http://localhost:3000

## 🧪 Testing Completo

```bash
# 1. Borrar datos anteriores y levantar servicios
docker-compose down -v
./scripts/setup-and-up.sh

# 2. Probar session-store
./scripts/test-integration.sh

# 3. Iniciar edge-agent
./scripts/run-edge-docker.sh up --fg

# 4. Ver detecciones generadas por edge-agent
curl http://localhost:8080/sessions | jq '.sessions[0].session_id'
curl http://localhost:8080/detections/session/<session_id> | jq
```

## 🔧 Troubleshooting

### Edge agent no inicia
```bash
# Verificar build
ls -la services/edge-agent/dist/

# Recompilar
cd services/edge-agent
npm run build

# Ver logs
docker-compose logs edge-agent
```

### Sin video de cámara
```bash
# Verificar dispositivo
ls -la /dev/video*

# Probar con otra cámara
./scripts/run-edge-local.sh --camera-device=/dev/video2

# Editar .env del edge-agent
nano services/edge-agent/.env
# Cambiar: CAMERA_DEVICE=/dev/video0
```

### Stream no aparece en MediaMTX
```bash
# El stream solo aparece cuando edge-agent está en estado ACTIVE
# Esto ocurre cuando la IA detecta objetos relevantes

# Recordatorio: el stream aparece en estado ACTIVE (detección relevante)
# Ver logs para confirmar transiciones (FSM):
./scripts/run-edge-docker.sh logs | grep -E "(FSM|detection)"
```

### Detecciones no se guardan
```bash
# Verificar que session-store esté corriendo
curl http://localhost:8080/health

# Ver logs del session-store
docker-compose logs session-store

# Ver logs del edge-agent (módulo sessionio)
./scripts/run-edge-docker.sh logs | grep sessionio
```

## 📝 Notas

- **Edge Agent Profile**: El edge-agent usa `profiles: [edge]` en docker-compose, por eso necesita `--profile edge` o el script `run-edge-docker.sh`
 
- **GStreamer**: Necesario para ejecutar localmente, ya incluido en la imagen Docker
- **Timezone**: Todos los servicios usan UTC, sincronizado con el host
- **Detecciones**: Se almacenan en batch con idempotencia por event_id (ON CONFLICT DO NOTHING)
