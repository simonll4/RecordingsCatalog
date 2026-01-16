import { Router } from 'express';
import multer from 'multer';
import { IngestController } from '../controllers/ingest.controller.js';

const router = Router();
const controller = new IngestController();

// Configure multer for multipart form data
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max
  },
});

// Ingest endpoints
router.post('/',
  upload.fields([
    { name: 'meta', maxCount: 1 },
    { name: 'frame', maxCount: 1 },
  ]),
  controller.processIngest.bind(controller)
);

// Detection queries (for internal use only)
router.get('/detections/:sessionId', controller.getSessionDetections.bind(controller));

export default router;
