# Fix: Edge-Agent conectando a Worker Local

## Problema

Desde Docker, `localhost` se refiere al contenedor mismo, no al host. Error:

```
getaddrinfo EAI_AGAIN worker-ai
```

## Solución

### ✅ Cambios Aplicados

**1. services/edge-agent/config.toml**
```toml
worker_host = "host.docker.internal"  # Era "localhost"
worker_port = 7001
```

**2. docker-compose.yml**
```yaml
  edge-agent:
    extra_hosts:
      - "host.docker.internal:host-gateway"  # AGREGADO
```

## Ejecutar

**Terminal 1: Worker**
```bash
cd /home/simonll4/Desktop/New\ Folder/tpfinal-v3/services/worker-ai
./run.sh
```

**Terminal 2: Docker Services**
```bash
cd /home/simonll4/Desktop/New\ Folder/tpfinal-v3

# Reconstruir edge-agent con nueva config
docker-compose build edge-agent

# Iniciar servicios
docker-compose up edge-agent mediamtx session-store postgres
```

## Verificar

✅ Worker dice: `AI Worker listening on 0.0.0.0:7001`
✅ Edge-agent dice: `AI Feeder initialized` (sin errores de conexión)
✅ Ventana OpenCV aparece mostrando frames

## Revertir a Producción (Todo en Docker)

En `services/edge-agent/config.toml`:
```toml
worker_host = "worker-ai"  # Volver al nombre del servicio Docker
worker_port = 7001
```

Quitar `extra_hosts` del edge-agent en `docker-compose.yml`.
