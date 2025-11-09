# Quickstart - Attribute Enricher

Guía rápida para poner en marcha el servicio de enriquecimiento de atributos.

## Setup inicial (5 minutos)

### 1. Ejecutar migración de base de datos

```bash
# Desde el directorio raíz de RecordingsCatalog
psql -h localhost -p 15432 -U postgres -d session_store -f services/session-store/migrations/002_add_attributes_enriched.sql
```

**Salida esperada:**
```
NOTICE:  Added attributes column to detections table
NOTICE:  Added enriched column to detections table
NOTICE:  Migration 002 completed successfully
```

### 2. Preparar datos de prueba

#### En Windows (PowerShell):

```powershell
cd services/attribute-enricher
.\scripts\setup_test_frames.ps1
cd ..\..
```

#### En Linux/Mac:

```bash
cd services/attribute-enricher
chmod +x scripts/setup_test_frames.sh
./scripts/setup_test_frames.sh
cd ../..
```

### 3. Insertar detecciones de prueba

```bash
psql -h localhost -p 15432 -U postgres -d session_store -f services/attribute-enricher/scripts/setup_test_data.sql
```

**Salida esperada:**
```
Test data inserted successfully!
 session_id      | track_id | cls    | conf | enriched 
-----------------+----------+--------+------+----------
 test_session_001| track_001| person | 0.89 | f
 test_session_001| track_002| person | 0.92 | f
 test_session_001| track_003| person | 0.87 | f
```

### 4. Iniciar el servicio

```bash
docker-compose up -d attribute-enricher
```

### 5. Verificar funcionamiento

```bash
# Ver logs en tiempo real
docker-compose logs -f attribute-enricher
```

**Logs esperados:**
```
attribute-enricher  | 2025-11-08 18:55:00 - INFO - Starting attribute enrichment worker
attribute-enricher  | 2025-11-08 18:55:00 - INFO - Connected to database at postgres:5432
attribute-enricher  | 2025-11-08 18:55:00 - INFO - Database schema updated successfully
attribute-enricher  | 2025-11-08 18:55:01 - INFO - Processing 3 unenriched detections
attribute-enricher  | 2025-11-08 18:55:02 - INFO - Enriched detection test_session_001/track_001 with color: azul oscuro
...
```

### 6. Verificar resultados

```sql
-- Conectar a la base de datos
psql -h localhost -p 15432 -U postgres -d session_store

-- Ver resultados
SELECT 
  track_id,
  cls,
  enriched,
  attributes->'color'->>'name' as color_name,
  attributes->'color'->>'hex' as color_hex
FROM detections 
WHERE session_id = 'test_session_001'
ORDER BY track_id;
```

**Salida esperada:**
```
 track_id | cls    | enriched | color_name      | color_hex 
----------+--------+----------+-----------------+-----------
 track_001| person | t        | azul oscuro     | #1E3A5F
 track_002| person | t        | rojo brillante  | #D32F2F
 track_003| person | t        | verde claro     | #66BB6A
```

## Verificar frames anotados

Los frames originales ahora tienen el bounding box dibujado con el color detectado:

```bash
# Ver frames
ls -lh data/frames/test_session_001/

# En Windows
dir data\frames\test_session_001\
```

## Detener el servicio

```bash
docker-compose stop attribute-enricher
```

## Troubleshooting rápido

### El servicio no inicia

```bash
# Ver logs completos
docker-compose logs attribute-enricher

# Reconstruir contenedor
docker-compose build attribute-enricher
docker-compose up -d attribute-enricher
```

### No se procesan detecciones

```bash
# Verificar que existen detecciones sin enriquecer
psql -h localhost -p 15432 -U postgres -d session_store -c "SELECT COUNT(*) FROM detections WHERE enriched = false;"

# Verificar conexión del servicio
docker-compose exec attribute-enricher python -c "import psycopg2; print('OK')"
```

### Frames no encontrados

```bash
# Verificar que los frames existen
docker-compose exec attribute-enricher ls -la /data/frames/test_session_001/

# Verificar permisos
docker-compose exec attribute-enricher stat /data/frames/test_session_001/track_001.jpg
```

## Uso con datos reales

Para procesar tus propias detecciones:

1. Asegúrate de que las detecciones en la BD tienen:
   - `enriched = false`
   - `url_frame` apuntando a un frame existente
   - `bbox` con coordenadas normalizadas (x, y, w, h en rango 0-1)

2. El servicio procesará automáticamente todas las detecciones sin enriquecer

3. Consultar resultados:

```sql
-- Buscar por color
SELECT * FROM detections 
WHERE attributes->'color'->>'family' = 'blue'
  AND enriched = true;

-- Estadísticas de colores
SELECT 
  attributes->'color'->>'family' as color_family,
  COUNT(*) as count
FROM detections 
WHERE enriched = true
GROUP BY color_family
ORDER BY count DESC;
```

## Configuración personalizada

Editar `services/attribute-enricher/config.yaml` para ajustar:

- Intervalo de polling
- Tamaño de lote
- Parámetros de extracción de color
- Naming (CSS3 vs descriptivo en español)

Luego reiniciar:

```bash
docker-compose restart attribute-enricher
```

## Próximos pasos

- Ver [README.md](README.md) para documentación completa
- Revisar configuraciones avanzadas en `config.yaml`
- Integrar con frontend para mostrar colores
- Implementar búsquedas por color

