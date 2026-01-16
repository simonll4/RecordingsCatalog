import { createApp } from './app.js';
import { CONFIG } from './config/config.js';
import { healthCheck } from './database/connection.js';
import { ensureSchema } from './database/migrations.js';
import { IngestService } from './services/ingest.service.js';

/**
 * Start the HTTP server
 */
async function startServer(): Promise<void> {
  // Check database connection
  const healthy = await healthCheck();
  if (!healthy) {
    console.error('Database connection failed');
    process.exit(1);
  }

  // Ensure database schema is up to date
  try {
    await ensureSchema();
    console.log('Database schema updated successfully');
  } catch (error) {
    console.error('Failed to update database schema', error);
    process.exit(1);
  }

  // Initialize services
  const ingestService = new IngestService();
  await ingestService.initFramesDirectory();

  // Create and start Express app
  const app = createApp();
  
  app.listen(CONFIG.PORT, () => {
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: 'session-store-listening',
      port: CONFIG.PORT,
      env: CONFIG.NODE_ENV,
    }));
  });
}

// Start server if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((err) => {
    console.error('Failed to start server', err);
    process.exit(1);
  });
}

export { startServer };
