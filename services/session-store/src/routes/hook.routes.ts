import { Router } from 'express';
import { HookController } from '../controllers/hook.controller.js';
import { validateHookToken } from '../middleware/validation.middleware.js';

const router = Router();
const controller = new HookController();

// MediaMTX hooks
router.post('/mediamtx/publish', 
  validateHookToken,
  controller.handlePublish.bind(controller)
);

router.post('/mediamtx/record/segment/complete',
  validateHookToken,
  controller.handleRecordSegmentComplete.bind(controller)
);

export default router;
