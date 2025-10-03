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
Instala dependencias y compila los servicios Node.js/TypeScript.

```bash
./scripts/setup-and-up.sh
```

### 3. `verify-timezone-sync.sh`
Verifica que todos los contenedores estén sincronizados en UTC.

```bash
./scripts/verify-timezone-sync.sh
```

### 4. `run-edge-local.sh`
Ejecuta el agente de edge localmente para pruebas y simulación.

```bash
# Ejecución básica (detección automática de cámara)
./scripts/run-edge-local.sh

# Con cámara específica
./scripts/run-edge-local.sh --camera-device=/dev/video1

# Forzar uso de cámara
./scripts/run-edge-local.sh --with-camera

# Sin cámara (modo simulación)
./scripts/run-edge-local.sh --no-camera
```