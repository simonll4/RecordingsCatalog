import { Request, Response, NextFunction } from 'express';

/**
 * Request logging middleware
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const started = Date.now();
  
  res.on('finish', () => {
    const elapsed = Date.now() - started;
    const logLine = JSON.stringify({
      ts: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      elapsed_ms: elapsed,
      ip: req.ip,
    });
    console.log(logLine);
  });
  
  next();
}
