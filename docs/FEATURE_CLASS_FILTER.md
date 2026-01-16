# Filtro de Clases Detectadas

## 📋 Descripción

Nueva funcionalidad que permite filtrar sesiones por las clases de objetos detectados durante la grabación. El sistema mantiene un registro acumulativo (tipo Set) de todas las clases únicas detectadas en cada sesión.

## 🎯 Clases Disponibles

El modelo YOLO11 entrenado detecta las siguientes 5 clases:

- 👤 **person** - Personas
- 🎒 **backpack** - Mochilas
- 🍾 **bottle** - Botellas
- ☕ **cup** - Tazas/vasos
- 👟 **shoes** - Zapatos

## 🔧 Implementación

### Backend (session-store)

#### Base de Datos
- **Nueva columna**: `detected_classes TEXT[]` en la tabla `sessions`
- **Índice GIN**: Optimizado para consultas de arrays (`&&` operator)
- **Acumulación automática**: Se agrega cada clase única detectada durante el ingestion

#### API
- **Endpoint existente modificado**: `GET /sessions/range`
- **Nuevo parámetro de query**: `classes` (comma-separated o array)
- **Ejemplo**: `/sessions/range?from=2024-01-01T00:00:00Z&to=2024-01-02T00:00:00Z&classes=person,bottle`

#### Lógica de Negocio
```typescript
// En IngestService.processIngest()
// 1. Detecta nuevas clases en el frame
const newClassesInFrame = new Set<string>()
for (const detection of detections) {
  newClassesInFrame.add(detection.cls)
}

// 2. Las agrega a la sesión (comportamiento tipo Set en PostgreSQL)
for (const className of newClassesInFrame) {
  await sessionRepository.addDetectedClass(sessionId, className)
}
```

### Frontend (vue-ui)

#### Componentes Nuevos

**ClassFilter.vue**
- Muestra chips interactivos para cada clase
- Multi-select con estados visuales claros
- Botones "Todas" / "Ninguna" para UX mejorada
- Emojis para identificación rápida de clases

**Mejoras en SessionSearch.vue**
- Integra el componente `ClassFilter`
- Envía clases seleccionadas junto con el rango temporal
- Mantiene estado de filtros entre búsquedas

**Mejoras en SessionList.vue**
- Muestra badges con las clases detectadas en cada sesión
- Visualización consistente con el filtro (mismos emojis)
- Tags estilizados para mejor legibilidad

#### Flujo de Usuario

1. Usuario selecciona rango de tiempo (15m, 1h, 3h, etc.)
2. (Opcional) Selecciona una o más clases a filtrar
3. Presiona "Buscar"
4. Sistema retorna solo sesiones que detectaron AL MENOS una de las clases seleccionadas
5. Lista muestra todas las clases detectadas en cada sesión

## 🚀 Migración

### Aplicar Migración en Producción

```bash
# Opción 1: Script automatizado
./scripts/migrate_detected_classes.sh

# Opción 2: Manual
docker compose exec session-store psql -U postgres -d tpfinal \
  -f /app/migrations/001_add_detected_classes.sql
```

### Verificar Migración

```bash
docker compose exec session-store psql -U postgres -d tpfinal -c "\d sessions"
```

Debe mostrar:
```
 detected_classes | text[]  | | default '{}'::text[]
```

## 📊 Ejemplos de Uso

### Consulta SQL Directa
```sql
-- Sesiones que detectaron personas
SELECT * FROM sessions 
WHERE 'person' = ANY(detected_classes);

-- Sesiones que detectaron persona Y botella
SELECT * FROM sessions 
WHERE detected_classes @> ARRAY['person', 'bottle'];

-- Sesiones que detectaron persona O botella
SELECT * FROM sessions 
WHERE detected_classes && ARRAY['person', 'bottle'];
```

### API REST
```bash
# Sesiones con personas detectadas
curl "http://localhost:8080/sessions/range?from=2024-01-01T00:00:00Z&to=2024-01-02T00:00:00Z&classes=person"

# Sesiones con personas O botellas
curl "http://localhost:8080/sessions/range?from=2024-01-01T00:00:00Z&to=2024-01-02T00:00:00Z&classes=person,bottle"
```

### TypeScript (Frontend)
```typescript
await sessionService.listSessions({
  mode: 'range',
  from: startDate.toISOString(),
  to: endDate.toISOString(),
  classes: ['person', 'bottle']
})
```

## 🎨 UX/UI Highlights

- **Visual Consistency**: Mismos emojis en filtro y resultados
- **Multi-select Intuitivo**: Click para toggle, estados activos claros
- **Feedback Inmediato**: Resumen de selección en tiempo real
- **Responsive Design**: Se adapta a móvil y desktop
- **Accesibilidad**: Botones grandes, alto contraste, labels descriptivos

## 🔄 Retrocompatibilidad

- Sesiones antiguas tienen `detected_classes = []` por defecto
- API funciona sin parámetro `classes` (retorna todas las sesiones)
- Frontend maneja ausencia del campo gracefully
- No requiere regenerar datos históricos

## 📝 Notas Técnicas

### PostgreSQL Array Operators
- `&&` (overlap): TRUE si hay al menos un elemento en común
- `@>` (contains): TRUE si el array contiene todos los elementos
- `=` ANY: TRUE si el valor está en el array

### Performance
- **GIN Index**: Consultas O(log n) en lugar de O(n)
- **Set Semántico**: PostgreSQL maneja duplicados en query level
- **Lazy Loading**: Clases se acumulan durante ingest, no post-proceso

### Limitaciones Conocidas
- No soporta filtrado por "exactamente estas clases"
- No cuenta frecuencia de detecciones (solo presencia/ausencia)
- No filtra por confidence mínimo de clases

## 🛠️ Troubleshooting

**Problema**: Filtro no retorna sesiones esperadas
- Verificar que las sesiones tengan `detected_classes` poblado
- Confirmar que el ingest está agregando clases correctamente
- Revisar logs del `IngestService`

**Problema**: Migración falla
- Verificar permisos de usuario PostgreSQL
- Confirmar que la tabla `sessions` existe
- Revisar si hay sesiones con valores NULL (deben ser '{}')

**Problema**: UI no muestra clases
- Verificar que el backend retorna `detected_classes` en el JSON
- Confirmar schema de Zod está actualizado
- Revisar console del browser por errores de tipo
