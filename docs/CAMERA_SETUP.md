# 📷 Configuración de Cámara para Edge-Agent

## 🔍 Diagnóstico

### 1. Verificar Dispositivos de Video

```bash
# Listar dispositivos
ls -la /dev/video*

# Verificar con v4l2
v4l2-ctl --list-devices

# Ver permisos
ls -la /dev/video0
# Salida esperada: crw-rw----+ 1 root video 81, 0 ...
```

### 2. Verificar Grupo Video

```bash
# Obtener GID del grupo video
getent group video
# Salida: video:x:44:usuario

# Verificar que tu usuario está en el grupo
groups | grep video
```

### 3. Verificar Docker

```bash
# Docker Engine (nativo) soporta devices directamente
docker --version

# Docker Desktop puede tener limitaciones con devices
```

---

## ✅ Solución 1: Docker Compose con Camera Override

### Opción A: Usar docker-compose.camera.yml

```bash
# Levantar edge-agent con cámara
docker compose -f docker-compose.yml -f docker-compose.camera.yml --profile edge up edge-agent -d

# Ver logs
docker compose -f docker-compose.yml -f docker-compose.camera.yml logs edge-agent -f
```

### Opción B: Descomentar en docker-compose.yml

Editar `docker-compose.yml` en la sección `edge-agent`:

```yaml
devices:
  - "/dev/video0:/dev/video0"
  - "/dev/video1:/dev/video1"
group_add:
  - "44"  # GID del grupo video
```

---

## ✅ Solución 2: Ejecutar Localmente (Recomendado para Desarrollo)

```bash
# Ejecutar edge-agent localmente (fuera de Docker)
cd services/edge-agent
npm install
npm run dev
```

**Ventajas:**
- ✅ Acceso directo a hardware
- ✅ Sin problemas de permisos de Docker
- ✅ Debugging más fácil
- ✅ Recarga rápida de código

**Configuración**: Editar `services/edge-agent/config.toml` para ajustar parámetros de cámara.

---

## ✅ Solución 3: Modo Test con Video Sintético

Si no tienes cámara o hay problemas de permisos, usa videotestsrc:

### Modificar capture.ts temporalmente:

```typescript
// En src/modules/capture.ts, reemplazar pipeline:
const args = [
  "-e",
  "videotestsrc", "pattern=smpte",  // Video de prueba
  "!",
  "videoconvert",
  "!",
  "videoscale",
  // ... resto del pipeline
];
```

Luego rebuild:
```bash
cd services/edge-agent
npm run build
docker compose --profile edge up edge-agent --build -d
```

---

## 🐛 Troubleshooting

### Error: "Cannot identify device '/dev/video0'"

**Causa:** El contenedor no puede acceder al dispositivo.

**Soluciones:**

1. **Verificar que el dispositivo existe:**
   ```bash
   ls -la /dev/video0
   ```

2. **Verificar permisos del dispositivo:**
   ```bash
   # El dispositivo debe ser del grupo video
   ls -la /dev/video0
   # Salida: crw-rw----+ 1 root video ...
   ```

3. **Verificar GID en docker-compose:**
   ```bash
   getent group video
   # Usar el GID correcto en group_add
   ```

4. **Docker Desktop:**
   Si usas Docker Desktop, puede tener limitaciones. Opciones:
   - Usar Docker Engine nativo
   - Ejecutar localmente: `cd services/edge-agent && npm run dev`

### Error: "Device or resource busy"

**Causa:** Otro proceso está usando la cámara.

**Solución:**
```bash
# Ver qué proceso usa la cámara
lsof /dev/video0

# Matar proceso si es necesario
sudo kill <PID>

# O cerrar aplicación (Chrome, Zoom, etc.)
```

### Error: "Permission denied"

**Causa:** Usuario no está en grupo video o Docker no tiene permisos.

**Solución:**
```bash
# Agregar usuario al grupo video
sudo usermod -aG video $USER

# Logout y login nuevamente
# O reiniciar sesión:
newgrp video

# Verificar
groups | grep video
```

---

## 📊 Comparación de Soluciones

| Solución | Pros | Contras | Recomendado |
|----------|------|---------|-------------|
| **Local** (`npm run dev`) | ✅ Sin problemas de permisos<br>✅ Acceso directo a hardware<br>✅ Debug fácil | ❌ Requiere deps instaladas<br>❌ No containerizado | **✅ Desarrollo** |
| **Docker + devices** | ✅ Containerizado<br>✅ Reproducible | ❌ Problemas con Docker Desktop<br>❌ Requiere permisos | **✅ Producción** |
| **videotestsrc** | ✅ Sin hardware necesario<br>✅ Funciona siempre | ❌ No es video real<br>❌ Requiere modificar código | **✅ Testing/CI** |

---

## 🚀 Configuración Recomendada por Ambiente

### Desarrollo Local
```bash
# Opción 1: Ejecutar localmente (más confiable)
cd services/edge-agent
npm install
npm run dev

# Opción 2: Docker con devices habilitados
docker compose --profile edge up edge-agent -d
```

### Testing/CI (sin cámara)
```bash
# Modificar capture.ts para usar videotestsrc
# Luego:
docker compose --profile edge up edge-agent --build -d
```

### Producción (servidor con cámara)
```bash
# Verificar configuración
getent group video  # Anotar GID
ls -la /dev/video0  # Verificar permisos

# Actualizar docker-compose.yml con devices
# O usar docker-compose.camera.yml

# Levantar
docker compose -f docker-compose.yml -f docker-compose.camera.yml --profile edge up -d
```

---

## ✅ Verificación de Funcionamiento

Una vez configurado, verificar:

```bash
# 1. Ver logs del edge-agent
docker compose logs edge-agent -f

# 2. Buscar inicialización exitosa
# Debe mostrar:
# [gst-capture] Pipeline started
# [Orchestrator] Initialized in IDLE state

# 3. NO debe mostrar:
# ERROR: Cannot identify device '/dev/video0'

# 4. Verificar stream en MediaMTX
curl http://localhost:9996/v3/paths/list | jq

# 5. Verificar sesiones en session-store
curl http://localhost:8080/sessions | jq
```

---

## 📝 Configuración Actual del Sistema

**Host:**
- Usuario: `simonll4`
- Grupo video GID: `44`
- Dispositivos: `/dev/video0`, `/dev/video1`
- Cámara: HP TrueVision HD Camera

**Docker:**
- Compose file: `docker-compose.yml` (devices ya mapeados por defecto)
- Edge-agent profile: `edge`

**Comandos rápidos:**
```bash
# Con cámara (Docker)
docker compose --profile edge up -d

# Sin cámara (local)
cd services/edge-agent && npm run dev

# Ver logs
docker compose logs edge-agent -f
```
