# Migration Guide - Session Store Refactoring

## Overview
The session-store service has been completely refactored with a professional layered architecture for better maintainability, testability, and scalability.

## Breaking Changes

### 1. Removed Endpoints

#### ❌ GET /sessions/:sessionId/clip
**Previous:** Generated MediaMTX playback URLs server-side  
**New:** Client-side URL generation using `playbackService.buildSessionPlaybackUrl()`

**Migration:**
```javascript
// Before (Vue UI)
const clip = await sessionService.getSessionClip(sessionId)

// After (Vue UI)
const session = await sessionService.getSession(sessionId)
const clip = playbackService.buildSessionPlaybackUrl(session)
```

#### ❌ POST /detections (public endpoint)
**Previous:** Public endpoint for batch detection insertion  
**New:** Detections only via `/ingest` endpoint with frame data

#### ❌ POST /hooks/mediamtx/record/segment/start
**Previous:** Hook for segment start events  
**New:** Removed (not configured in MediaMTX)

### 2. API Changes

#### Session Open Payload
**Now accepts both field names for compatibility:**
```javascript
// Both are valid:
{ path: "stream-path", ... }      // New format
{ streamPath: "stream-path", ... } // Legacy format (edge-agent)
```

#### Track Data Access
**Previous:**
- `/sessions/:sessionId/segment/:index`
- `/sessions/:sessionId/index`
- `/sessions/:sessionId/meta`

**New:**
- `/sessions/:sessionId/tracks/:segment` 
- `/sessions/:sessionId/tracks/index`
- Metadata removed (use session details)

### 3. Internal Architecture

#### File Structure
```
OLD:
src/
  ├── index.ts        # Everything mixed
  ├── config.ts       
  ├── db.ts          
  └── routes/
      ├── sessions.ts # 500+ lines
      ├── detections.ts
      ├── ingest.ts
      └── hooks.ts

NEW:
src/
  ├── server.ts       # Entry point
  ├── app.ts          # Express config
  ├── config/         # Configuration layer
  ├── database/       # Data layer
  │   └── repositories/
  ├── services/       # Business logic
  ├── controllers/    # HTTP handlers
  ├── routes/         # Route definitions
  ├── middleware/     # Cross-cutting
  ├── types/          # TypeScript types
  └── utils/          # Utilities
```

## Non-Breaking Improvements

### 1. Fixed Issues
- ✅ Hardcoded paths now use `CONFIG.FRAMES_STORAGE_PATH`
- ✅ Proper error handling middleware
- ✅ Structured JSON logging
- ✅ Request validation middleware
- ✅ Cache headers for static content

### 2. Better Separation of Concerns
- Database logic isolated in repositories
- Business logic in service layer
- HTTP handling in controllers
- Reusable utilities extracted

### 3. Improved Type Safety
- All types centralized in `types/` directory
- Strict TypeScript configuration
- Better IDE support

## Edge Agent Compatibility

The edge-agent **does not need changes**. The session-store adapts to its payload format:

```javascript
// Edge agent sends (unchanged):
{
  sessionId: "sess_cam-01_xxx",
  devId: "cam-01",
  streamPath: "cam-01",  // Note: streamPath not path
  startTs: "2024-01-01T12:00:00Z",
  reason: "relevance"
}

// Session store handles both:
const path = body.path || body.streamPath || body.devId;
```

## Vue UI Updates

The Vue UI has been updated to:
1. Remove dependency on `/clip` endpoint
2. Build playback URLs client-side
3. Use new track endpoints

**Files updated:**
- `src/api/services/session.service.ts`
- `src/api/sessions-legacy.ts`
- `src/constants/api-endpoints.ts`
- `src/views/Session.vue`

## Testing the Migration

### 1. Build and Start
```bash
cd services/session-store
npm run build
npm start
```

### 2. Verify Endpoints
```bash
# Health check
curl http://localhost:8080/health

# Open session (supports both formats)
curl -X POST http://localhost:8080/sessions/open \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test","devId":"dev1","streamPath":"path1","startTs":"2024-01-01T12:00:00Z"}'

# List sessions
curl http://localhost:8080/sessions
```

### 3. Check Vue UI
- Session listing should work
- Session playback should work (client-side URL generation)
- Track overlays should work with new endpoints

## Rollback Plan

If issues arise:
1. The old code is in git history
2. Database schema is backward compatible
3. Edge agent doesn't need changes

## Benefits of the Refactoring

1. **Maintainability**: Clear separation of concerns
2. **Testability**: Each layer can be tested independently  
3. **Scalability**: Easy to add new features
4. **Performance**: Better caching, optimized queries
5. **Developer Experience**: Clean code, better types, clear structure

## Support

For questions about the migration:
- Check the new README.md for architecture details
- Review the TypeScript types in `src/types/`
- Look at controller implementations for API contracts
