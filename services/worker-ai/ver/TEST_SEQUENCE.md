# Secuencia de Testing Local

## ⚠️ IMPORTANTE: Orden de Ejecución

El edge-agent intenta conectarse al worker inmediatamente al iniciar. Si el worker no está corriendo, el edge-agent falla.

## Secuencia Correcta

### 1️⃣ Terminal 1: Iniciar Worker (PRIMERO)

```bash
cd /home/simonll4/Desktop/New\ Folder/tpfinal-v3/services/worker-ai
./run.sh
```

**Espera a ver**:
```
✓ Visualization ENABLED (cv2 available)
Tracker initialized: botsort
Session manager initialized: output_dir=./data/tracks
AI Worker listening on 0.0.0.0:7001
```

### 2️⃣ Terminal 2: Iniciar Edge-Agent (DESPUÉS)

```bash
cd /home/simonll4/Desktop/New\ Folder/tpfinal-v3

# Reconstruir si cambiaste config
docker-compose build edge-agent

# Iniciar edge-agent y dependencias
docker-compose up edge-agent mediamtx session-store postgres
```

**Deberías ver**:
```
edge-agent  | Connecting to AI worker
edge-agent  | Camera hub ready
```

**En el worker deberías ver**:
```
Client connected from ('172.x.x.x', XXXXX)
Processing frame for session: ...
```

**Y la ventana OpenCV con los frames**.

## 🛑 Si algo falla

### El worker se cerró
```bash
# Terminal 1: Reiniciar worker
cd /home/simonll4/Desktop/New\ Folder/tpfinal-v3/services/worker-ai
./run.sh
```

### El edge-agent sigue fallando
```bash
# Terminal 2: Reiniciar edge-agent
docker-compose restart edge-agent

# O detener y volver a iniciar
docker-compose down
docker-compose up edge-agent mediamtx session-store postgres
```

## ✅ Verificación Exitosa

- [ ] Worker escuchando en 0.0.0.0:7001
- [ ] Edge-agent conectado sin errores
- [ ] Ventana OpenCV mostrando frames
- [ ] Logs del worker muestran "Processing frame"
- [ ] Archivos JSON en `./data/tracks/{session_id}/`

## 📊 Monitorear en tiempo real

```bash
# Terminal 3: Ver logs del edge-agent
docker logs -f tpfinalv3-edge-agent

# Terminal 4: Ver archivos generados
watch -n 2 'find ./data/tracks -type f'
```
