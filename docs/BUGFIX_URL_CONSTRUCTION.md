# 🐛 Critical Bugfix: new URL() Path Resolution

## The Real Problem

### Root Cause
JavaScript's `new URL(path, base)` treats paths starting with `/` as **absolute paths from the domain root**, ignoring the base URL's path component.

```javascript
// WRONG ❌
new URL("/range", "http://localhost:8080/sessions/")
// Result: "http://localhost:8080/range"
// The "/sessions" is ignored!

// CORRECT ✅  
new URL("range", "http://localhost:8080/sessions/")
// Result: "http://localhost:8080/sessions/range"
```

### Why It Happened
During refactoring, we added `/sessions` to the baseURL:
```typescript
baseURL: `${urls.sessionStore}/sessions`  // "http://localhost:8080/sessions"
```

But the endpoint constants still had leading slashes:
```typescript
SESSION_ENDPOINTS = {
  LIST_RANGE: '/range',  // ❌ Leading slash causes problem
  DETAILS: (id) => `/${encodeURIComponent(id)}`,  // ❌
}
```

### The Fix
Remove leading slashes from all endpoint paths:

```typescript
// BEFORE ❌
SESSION_ENDPOINTS = {
  OPEN: '/open',
  LIST_RANGE: '/range',
  DETAILS: (id) => `/${encodeURIComponent(id)}`,
}

// AFTER ✅
SESSION_ENDPOINTS = {
  OPEN: 'open',
  LIST_RANGE: 'range',
  DETAILS: (id) => `${encodeURIComponent(id)}`,
}
```

## Impact

### Before Fix
```
Vue UI Request: GET /range
URL Construction:
  baseURL: "http://localhost:8080/sessions"
  path: "/range"
  new URL("/range", "http://localhost:8080/sessions/")
  Result: "http://localhost:8080/range" ❌

Server: 404 Not Found (no /range endpoint exists)
```

### After Fix
```
Vue UI Request: GET range
URL Construction:
  baseURL: "http://localhost:8080/sessions"
  path: "range"
  new URL("range", "http://localhost:8080/sessions/")
  Result: "http://localhost:8080/sessions/range" ✅

Server: 200 OK (endpoint exists)
```

## Lessons Learned

1. **Relative vs Absolute Paths in URLs**: Paths starting with `/` are absolute
2. **API Design**: When using `baseURL + path`, paths should be relative (no leading `/`)
3. **Testing**: Test URL construction logic with actual values
4. **Documentation**: Document baseURL conventions clearly

## Files Modified
- `/services/vue-ui/src/constants/api-endpoints.ts`
  - Removed leading `/` from all `SESSION_ENDPOINTS` values

## Verification
```bash
# Build and deploy
npm run build
docker compose build vue-ui
docker compose up -d vue-ui

# Test endpoint
curl "http://localhost:8080/sessions/range?from=2025-10-25T22:00:00Z&to=2025-10-25T23:00:00Z"
# Should return: {"from":"...","to":"...","sessions":[...]}
```

## Date
**2025-10-25 23:35:00 UTC-03:00**

**Status**: ✅ FIXED AND DEPLOYED
