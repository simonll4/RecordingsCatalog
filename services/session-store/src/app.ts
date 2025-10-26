import express from 'express';
import cors from 'cors';
import path from 'path';
import { CONFIG } from './config/config.js';
import { HealthController } from './controllers/health.controller.js';
import { requestLogger } from './middleware/logging.middleware.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';

// Route imports
import sessionRoutes from './routes/session.routes.js';
import ingestRoutes from './routes/ingest.routes.js';
import hookRoutes from './routes/hook.routes.js';

/**
 * Create and configure Express application
 */
export function createApp(): express.Application {
  const app = express();

  // Basic middleware
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: '1mb' }));
  
  // Logging
  app.use(requestLogger);

  // Health check
  const healthController = new HealthController();
  app.get('/health', healthController.checkHealth.bind(healthController));

  // API Routes
  app.use('/sessions', sessionRoutes);
  app.use('/ingest', ingestRoutes);
  app.use('/hooks', hookRoutes);

  // Static files for frames (if needed for debugging)
  // Note: In production, frames should be served by a CDN or separate static server
  if (CONFIG.NODE_ENV === 'development') {
    app.use('/frames', express.static(CONFIG.FRAMES_STORAGE_PATH));
  }

  // Error handlers (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
