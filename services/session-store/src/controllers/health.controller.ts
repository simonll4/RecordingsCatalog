import { Request, Response } from 'express';
import { healthCheck } from '../database/connection.js';

export class HealthController {
  /**
   * Health check endpoint
   */
  async checkHealth(req: Request, res: Response): Promise<void> {
    const healthy = await healthCheck();
    
    res.json({
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'session-store',
    });
  }
}
