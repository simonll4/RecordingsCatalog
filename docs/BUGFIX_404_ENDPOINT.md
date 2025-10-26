# 🐛 Bugfix: 404 Error en Endpoint /range

## Problema Identificado

### Error en Consola del Navegador
```
GET http://localhost:8080/range?from=...&to=... 404 (Not Found)
HTTP 404: {"error":"Not found","path":"/range"}
```

### Causa Raíz
Durante la refactorización, se produjo un **desacople entre el cliente HTTP de Vue UI y la estructura de rutas del Session Store**:

1. **Session Store**: Endpoints bajo el path `/sessions/*`
   - `/sessions/range` ✅
   - `/sessions/` ✅
   - `/sessions/:sessionId` ✅

2. **Vue UI Cliente HTTP**: Configurado con `baseURL: http://localhost:8080`
   - Endpoints relativos: `/range`, `/`, etc.
   - **URL Final**: `http://localhost:8080/range` ❌ (Incorrecto)
   - **URL Esperada**: `http://localhost:8080/sessions/range` ✅

## Soluciones Implementadas

### 1. **Backend - Session Store** ✅

Agregado endpoint `/sessions/range` separado del endpoint genérico `/sessions`:

```typescript
// src/routes/session.routes.ts
router.get('/range', controller.listSessionsByRange.bind(controller));
router.get('/', controller.listSessions.bind(controller));
```

Split del controlador en dos métodos:

```typescript
// src/controllers/session.controller.ts
async listSessionsByRange(req, res, next) {
  // Retorna: { from, to, sessions }
}

async listSessions(req, res, next) {
  // Retorna: { sessions }
}
```

### 2. **Frontend - Vue UI** ✅

Corregida la configuración del `baseURL` del cliente HTTP para incluir `/sessions`:

```typescript
// src/api/http/factory.ts

// ANTES ❌
export const sessionStoreClient = new HttpClient({
  baseURL: urls.sessionStore, // http://localhost:8080
  headers: API_HEADERS.JSON,
})

// DESPUÉS ✅
export const sessionStoreClient = new HttpClient({
  baseURL: `${urls.sessionStore}/sessions`, // http://localhost:8080/sessions
  headers: API_HEADERS.JSON,
})
```

También actualizada la exportación de BASE_URLS:

```typescript
export const BASE_URLS = {
  SESSION_STORE: `${urls.sessionStore}/sessions`, // ✅
  MEDIAMTX: urls.mediamtx,
}
```

## Flujo de Peticiones Corregido

### Antes (Incorrecto)
```
Vue UI Request:
  sessionStoreClient.getJson('/range', ...)
  
URL Construida:
  baseURL: http://localhost:8080
  path: /range
  Final: http://localhost:8080/range ❌

Session Store:
  No existe endpoint /range (solo /sessions/range)
  Resultado: 404 Not Found ❌
```

### Después (Correcto)
```
Vue UI Request:
  sessionStoreClient.getJson('/range', ...)
  
URL Construida:
  baseURL: http://localhost:8080/sessions
  path: /range
  Final: http://localhost:8080/sessions/range ✅

Session Store:
  Endpoint existe: GET /sessions/range
  Resultado: 200 OK ✅
```

## Verificación

```bash
# Rebuild services
npm run build (session-store) ✅
npm run build (vue-ui) ✅

# Docker rebuild
docker compose build session-store ✅
docker compose build vue-ui ✅

# Verificar endpoints
curl "http://localhost:8080/sessions/range?from=...&to=..." ✅
Response: {"from":"...","to":"...","sessions":[]}

# Verificar contenedores
docker ps | grep -E "session-store|vue-ui" ✅
Both running
```

## Resultado Final

- ✅ Endpoint `/sessions/range` responde correctamente (HTTP 200)
- ✅ Vue UI hace peticiones a la URL correcta
- ✅ No más errores 404 en la consola del navegador
- ✅ La interfaz puede cargar la lista de sesiones
- ✅ Ambos servicios dockerizados y funcionando

## Lecciones Aprendidas

1. **Consistencia en rutas**: Al refactorizar, asegurar que cliente y servidor estén alineados
2. **baseURL del cliente**: Debe incluir todo el path base, no solo el dominio y puerto
3. **Testing end-to-end**: Verificar flujo completo después de cambios estructurales
4. **Documentación**: Mantener actualizada la estructura de endpoints

## Fecha
**2025-10-25 23:24:00 UTC-03:00**

**Estado**: ✅ RESUELTO Y VERIFICADO
