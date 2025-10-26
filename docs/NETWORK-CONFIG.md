# Configuración de Red para Cámaras IP (RTSP)

Este documento explica cómo configurar el acceso desde el contenedor `edge-agent` a cámaras IP en tu red LAN.

## Opciones de Red

### Opción 1: Red Bridge (Por Defecto) ✅ **RECOMENDADO**

**Configuración actual en `docker-compose.yml`**

El contenedor usa la red bridge por defecto de Docker, que permite acceso a la red LAN del host.

**Ventajas:**
- ✓ Aislamiento de red entre contenedores
- ✓ Acceso a servicios del host y LAN
- ✓ Compatible con todos los servicios del stack
- ✓ No requiere privilegios especiales

**Cuándo usar:**
- Para la mayoría de los casos de uso
- Cuando tienes múltiples servicios en Docker Compose
- Cuando quieres mantener aislamiento entre contenedores

**Configuración:**
```yaml
# No requiere configuración adicional (ya está así)
edge-agent:
  # ... resto de configuración
```

### Opción 2: Network Mode Host (Alternativa)

Si experimentas problemas de conectividad con la opción 1, puedes usar la red del host directamente.

**Configuración en `docker-compose.yml`:**
```yaml
edge-agent:
  network_mode: host  # Descomentar esta línea
  # ... resto de configuración
```

**Ventajas:**
- ✓ Acceso directo a todas las interfaces de red del host
- ✓ Mejor rendimiento de red (sin NAT)
- ✓ Útil para multicast/broadcast

**Desventajas:**
- ✗ Pierde aislamiento de red
- ✗ Conflictos de puertos con el host
- ✗ Los servicios deben usar `localhost` en lugar de nombres de servicio

**Cuándo usar:**
- Cuando la red bridge no funciona
- Para debugging de conectividad
- Si necesitas acceso a multicast/broadcast

## Verificación de Acceso

### 1. Prueba Rápida con Script

Ejecuta el script de prueba para verificar que el contenedor puede acceder a la cámara:

```bash
./test-rtsp-access.sh
```

Este script verifica:
1. Conectividad de red (ping)
2. Puerto RTSP accesible (554)
3. Stream RTSP válido (ffprobe)
4. Compatibilidad con GStreamer

### 2. Prueba Manual desde Contenedor

Puedes probar manualmente desde un contenedor temporal:

```bash
# Probar ping a la cámara
docker run --rm alpine ping -c 3 192.168.1.82

# Probar puerto RTSP
docker run --rm alpine nc -zv 192.168.1.82 554

# Probar stream con GStreamer (desde contenedor edge-agent)
docker compose run --rm edge-agent bash -c \
  "gst-launch-1.0 -q rtspsrc location=rtsp://admin:KBXBIN@192.168.1.82:554/Streaming/Channels/1 protocols=tcp ! fakesink"
```

### 3. Verificar Logs del Edge Agent

Una vez iniciado el servicio, verifica los logs:

```bash
docker compose logs -f edge-agent
```

Busca líneas como:
```
[INFO] Starting camera hub (source=rtsp)
[INFO] Camera hub ready
```

## Configuración de la Cámara

La configuración de la cámara IP está en: `services/edge-agent/config.toml`

```toml
[source]
kind = "rtsp"
uri = "rtsp://admin:KBXBIN@192.168.1.82:554/Streaming/Channels/1"
width = 640
height = 480
fps_hub = 15
```

### Cambiar Credenciales o IP

Edita directamente el archivo `config.toml` o usa variables de entorno:

```bash
# Opcional: Sobrescribir mediante variables de entorno
export CAM_IP="192.168.1.100"
export CAM_USER="admin"
export CAM_PASS="nueva_password"
```

## Troubleshooting

### Error: "Cannot connect to RTSP stream"

**Causa:** El contenedor no puede alcanzar la cámara IP.

**Soluciones:**
1. Verifica que la cámara esté en la misma red que el host
2. Prueba hacer ping desde el host: `ping 192.168.1.82`
3. Verifica firewall del host
4. Prueba con `network_mode: host`

### Error: "RTSP timeout"

**Causa:** La latencia es muy alta o la cámara no responde.

**Soluciones:**
1. Aumenta `latency` en `gstreamer.ts` (de 100ms a 200ms)
2. Verifica ancho de banda de la red
3. Reduce la resolución en `config.toml`

### Error: "Not authorized" o "401"

**Causa:** Credenciales incorrectas.

**Soluciones:**
1. Verifica usuario/password en `config.toml`
2. Accede a la cámara desde un browser: `http://192.168.1.82`
3. Verifica que la URL RTSP sea correcta

### Error: "Could not decode stream"

**Causa:** Codec no soportado o stream corrupto.

**Soluciones:**
1. Verifica que la cámara transmita H.264 o H.265
2. Prueba con otro canal: `Streaming/Channels/2`
3. Revisa logs de GStreamer para ver el codec detectado

## Cambiar entre Cámara IP y Cámara Local

### Para usar Cámara IP (RTSP) - Configuración Actual

En `config.toml`:
```toml
[source]
kind = "rtsp"
uri = "rtsp://admin:KBXBIN@192.168.1.82:554/Streaming/Channels/1"
```

En `docker-compose.yml`:
- Mantén comentadas las líneas de `devices`, `group_add`, `privileged`

### Para usar Cámara Local (USB/Webcam)

En `config.toml`:
```toml
[source]
kind = "v4l2"
uri = "/dev/video0"
```

En `docker-compose.yml`:
- Descomenta las líneas de `devices`, `group_add`, `privileged`

## Referencias

- [Documentación de rtspsrc (GStreamer)](https://gstreamer.freedesktop.org/documentation/rtsp/rtspsrc.html)
- [Docker Networking](https://docs.docker.com/network/)
- [Script de prueba RTSP](./rtsp_camera_gst.sh)
