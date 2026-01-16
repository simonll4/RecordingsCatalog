import { Router } from 'express';
import { SessionController } from '../controllers/session.controller.js';
import { attachSessionCacheHeaders } from '../middleware/validation.middleware.js';

const router = Router();
const controller = new SessionController();

// Session management
router.post('/open', controller.openSession.bind(controller));
router.post('/close', controller.closeSession.bind(controller));

// Session listing
router.get('/range', controller.listSessionsByRange.bind(controller));
router.get('/', controller.listSessions.bind(controller));
router.get('/:sessionId', controller.getSession.bind(controller));

// Track data access - specific routes first
router.get('/:sessionId/tracks/meta.json', 
  attachSessionCacheHeaders(3600),
  controller.getTrackMeta.bind(controller)
);
router.get('/:sessionId/tracks/index.json', 
  attachSessionCacheHeaders(3600),
  controller.getTrackIndex.bind(controller)
);
router.get('/:sessionId/tracks/:segment', 
  attachSessionCacheHeaders(86400),
  controller.streamSegment.bind(controller)
);

export default router;
