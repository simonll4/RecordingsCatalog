import express from 'express';
import cors from 'cors';
import { CONFIG } from './config.js';
import { db } from './db.js';
import { sessionsRouter } from './routes/sessions.js';

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    const elapsed = Date.now() - started;
    const logLine = JSON.stringify({
      ts: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      elapsed_ms: elapsed
    });
    console.log(logLine);
  });
  next();
});

app.get('/health', async (_req, res) => {
  const healthy = await db.healthCheck();
  res.json({
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString()
  });
});

app.use('/sessions', sessionsRouter);

type ErrorWithStatus = Error & { status?: number };

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: ErrorWithStatus, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error', err);
  res.status(err.status ?? 500).json({ error: 'Internal server error' });
});

const start = async () => {
  const healthy = await db.healthCheck();
  if (!healthy) {
    console.error('Database connection failed');
    process.exit(1);
  }

  try {
    await db.ensureSchema();
  } catch (error) {
    console.error('Failed to update database schema', error);
    process.exit(1);
  }

  app.listen(CONFIG.PORT, () => {
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: 'session-store-listening',
      port: CONFIG.PORT,
      env: CONFIG.NODE_ENV
    }));
  });
};

if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((err) => {
    console.error('Failed to start server', err);
    process.exit(1);
  });
}

export { app };
