# Attribute Enricher Service

Servicio de enriquecimiento de atributos para el sistema RecordingsCatalog. Este servicio procesa detecciones de objetos y extrae atributos visuales como el color dominante, almacenándolos en la base de datos para su posterior uso en búsquedas y análisis.

## Características

- **Extracción de color dominante**: Analiza el área del bounding box de cada detección y determina el color dominante usando clustering K-means en espacio CIE Lab
- **Nombres descriptivos en español**: Genera nombres de color descriptivos como "azul oscuro", "rojo brillante", "gris claro", etc.
- **Procesamiento automático**: Monitorea continuamente la base de datos buscando detecciones sin enriquecer
- **Alta precisión perceptual**: Usa el espacio de color CIE Lab y la métrica CIEDE2000 para análisis de color perceptualmente preciso
- **Manejo robusto de errores**: Marca detecciones que fallan con información de error para debugging

## Arquitectura

```
┌─────────────────┐
│   PostgreSQL    │
│  (detections)   │
└────────┬────────┘
         │
         │ Poll (enriched = false)
         │
┌────────▼─────────────────────────────────┐
│   Attribute Enricher Worker              │
│                                           │
│  1. Fetch unenriched detections          │
│  2. Load frame from filesystem           │
│  3. Crop to bounding box                 │
│  4. Extract color attributes             │
│     - K-means clustering in Lab space    │
│     - Dominant color selection           │
│     - Descriptive Spanish naming         │
│  5. Update database with attributes      │
│  6. Draw annotated bbox on frame         │
└──────────────────────────────────────────┘
```

## Instalación

### Requisitos previos

- Docker y Docker Compose
- PostgreSQL con tabla `detections` (ver migraciones)
- Directorio de frames accesible

### Migración de base de datos

Ejecutar el script de migración para agregar las columnas necesarias:

```bash
psql -h localhost -p 15432 -U postgres -d session_store -f services/session-store/migrations/002_add_attributes_enriched.sql
```

Esta migración agrega:
- Campo `attributes` (JSONB) para almacenar atributos enriquecidos
- Campo `enriched` (BOOLEAN) para tracking del estado de procesamiento
- Índices para optimizar queries

### Despliegue con Docker Compose

El servicio está configurado en el `docker-compose.yml` principal:

```bash
# Construir e iniciar el servicio
docker-compose up -d attribute-enricher

# Ver logs
docker-compose logs -f attribute-enricher

# Reiniciar
docker-compose restart attribute-enricher

# Detener
docker-compose stop attribute-enricher
```

## Configuración

El servicio se configura mediante `config.yaml` y variables de entorno:

### Variables de entorno principales

| Variable | Descripción | Default |
|----------|-------------|---------|
| `DB_HOST` | Host de PostgreSQL | `postgres` |
| `DB_PORT` | Puerto de PostgreSQL | `5432` |
| `DB_NAME` | Nombre de la base de datos | `session_store` |
| `DB_USER` | Usuario de la base de datos | `postgres` |
| `DB_PASSWORD` | Contraseña | `postgres` |
| `POLL_INTERVAL_SEC` | Intervalo de polling en segundos | `5` |
| `BATCH_SIZE` | Cantidad de detecciones por lote | `10` |
| `FRAMES_BASE_PATH` | Ruta base de frames | `/data/frames` |

### Configuración del proveedor de color

En `config.yaml`:

```yaml
color_provider:
  # Nombres descriptivos en español (true) o CSS3 (false)
  use_css3_names: false
  
  # Preprocesamiento
  white_balance: true
  gamma: 1.0
  equalize: false
  blur_radius: 1.0
  
  # Clustering
  min_k: 1
  max_k: 3
  sample_pixels: 5000
  
  # Filtrado de píxeles
  s_min: 0.05
  v_min: 0.02
  v_max: 0.98
```

## Uso

### Estructura de datos

#### Formato de entrada (detección)

```json
{
  "session_id": "sess_cam-local_1762403230448_1",
  "track_id": "1",
  "cls": "person",
  "conf": 0.89,
  "bbox": {
    "x": 0.5,
    "y": 0.5,
    "w": 0.4,
    "h": 0.6
  },
  "url_frame": "/frames/sess_cam-local_1762403230448_1/track_1.jpg",
  "enriched": false
}
```

#### Formato de salida (attributes)

```json
{
  "color": {
    "name": "azul oscuro",
    "family": "blue",
    "rgb": [0.12, 0.25, 0.48],
    "hex": "#1F3F7A"
  }
}
```

### Testing con datos de prueba

#### 1. Preparar frames de prueba

En **Windows** (PowerShell):

```powershell
cd services/attribute-enricher
.\scripts\setup_test_frames.ps1
```

En **Linux/Mac**:

```bash
cd services/attribute-enricher
chmod +x scripts/setup_test_frames.sh
./scripts/setup_test_frames.sh
```

Esto copia las imágenes de `improved_project/data/inputs` a `data/frames/test_session_001/`.

#### 2. Insertar detecciones de prueba

```bash
psql -h localhost -p 15432 -U postgres -d session_store -f services/attribute-enricher/scripts/setup_test_data.sql
```

#### 3. Verificar resultados

```sql
-- Ver detecciones enriquecidas
SELECT 
  session_id, 
  track_id, 
  cls,
  attributes->>'color' as color_info,
  enriched
FROM detections 
WHERE session_id = 'test_session_001';

-- Buscar por color específico
SELECT * FROM detections 
WHERE attributes->'color'->>'family' = 'blue';

-- Ver nombre de color
SELECT 
  track_id,
  attributes->'color'->>'name' as color_name,
  attributes->'color'->>'hex' as color_hex
FROM detections 
WHERE enriched = true;
```

## Algoritmo de extracción de color

### Proceso paso a paso

1. **Carga de imagen**: Lee el frame completo desde el filesystem
2. **Recorte**: Extrae la región del bounding box (coordenadas normalizadas)
3. **Preprocesamiento**:
   - Balance de blancos (Grey World)
   - Corrección gamma (opcional)
   - Ecualización de histograma (opcional)
   - Desenfoque gaussiano ligero
4. **Creación de máscara**: Genera máscara elíptica para enfocar en el objeto
5. **Filtrado de píxeles**:
   - Elimina píxeles con saturación muy baja
   - Filtra valores extremos (muy oscuro/claro)
   - Remueve reflejos especulares
6. **Conversión a Lab**: Transforma píxeles válidos a espacio CIE Lab
7. **Clustering K-means**: Agrupa colores similares (k=1-3)
8. **Selección de cluster dominante**: Considera peso, cromaticidad y luminancia
9. **Naming**:
   - Conversión a HSV para análisis
   - Clasificación por matiz, saturación y valor
   - Generación de nombre descriptivo en español

### Manejo de colores acromáticos

El sistema detecta automáticamente colores sin cromaticidad (blanco, negro, gris) analizando:
- Fracción de píxeles con baja saturación
- Distribución de valores de luminancia
- Umbrales adaptativos con margen de decisión

## Troubleshooting

### El servicio no procesa detecciones

**Verificar conexión a la base de datos:**

```bash
docker-compose logs attribute-enricher | grep "Connected to database"
```

**Verificar que hay detecciones sin enriquecer:**

```sql
SELECT COUNT(*) FROM detections WHERE enriched = false;
```

### Frames no encontrados

**Verificar rutas:**

```bash
# Dentro del contenedor
docker-compose exec attribute-enricher ls -la /data/frames

# Verificar volúmenes
docker-compose config | grep -A 5 attribute-enricher
```

**Ajustar FRAMES_BASE_PATH** si la estructura de directorios es diferente.

### Errores de procesamiento

**Ver detecciones con error:**

```sql
SELECT 
  session_id, 
  track_id,
  attributes->>'error' as error_message
FROM detections 
WHERE attributes->>'enrichment_failed' = 'true';
```

**Logs detallados:**

```bash
docker-compose logs -f attribute-enricher
```

## Desarrollo local

### Requisitos

```bash
pip install -r requirements.txt
```

### Ejecutar sin Docker

```bash
# Configurar variables de entorno
export DB_HOST=localhost
export DB_PORT=15432
export DB_NAME=session_store
export DB_USER=postgres
export DB_PASSWORD=postgres
export FRAMES_BASE_PATH=../../data/frames

# Ejecutar
python -m src.main
```

### Testing

```bash
# Unit tests (cuando estén disponibles)
python -m pytest tests/

# Integración manual
python scripts/test_color_extraction.py
```

## Rendimiento

### Métricas típicas

- **Procesamiento por detección**: 0.5-2 segundos (depende del tamaño de la imagen)
- **Throughput**: ~30-60 detecciones/minuto (con batch_size=10)
- **Memoria**: ~200-400 MB
- **CPU**: 1 core utilizado al 70-90% durante procesamiento

### Optimizaciones

- Ajustar `sample_pixels` para procesar más rápido con menor precisión
- Aumentar `poll_interval_sec` para reducir carga en la BD
- Aumentar `batch_size` para mejor throughput (más memoria)
- Usar `blur_radius=0` para eliminar preprocesamiento

## Próximas mejoras

- [ ] Extracción de más atributos (textura, patrones)
- [ ] Soporte para máscaras de segmentación
- [ ] API REST para procesamiento bajo demanda
- [ ] Exportación de debug images (clusters, paletas)
- [ ] Métricas Prometheus
- [ ] Health check endpoint

## Referencias

- **CIEDE2000**: Sharma, G., Wu, W., & Dalal, E. N. (2005). The CIEDE2000 color‐difference formula
- **K-means++**: Arthur, D., & Vassilvitskii, S. (2007). k-means++: The advantages of careful seeding
- **CIE Lab**: Commission Internationale de l'Eclairage (CIE)

## Licencia

Este proyecto es parte del Trabajo Final de Grado (TFG) en la Universidad.

## Soporte

Para preguntas o problemas, crear un issue en el repositorio o contactar al equipo de desarrollo.

