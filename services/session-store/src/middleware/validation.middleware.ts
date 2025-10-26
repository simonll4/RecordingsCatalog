import { Request, Response, NextFunction } from 'express';
import { CONFIG } from '../config/config.js';

/**
 * Validate MediaMTX hook token
 */
export function validateHookToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const hookToken = CONFIG.MEDIAMTX_HOOK_TOKEN;
  
  // No token configured, allow access
  if (!hookToken) {
    return next();
  }

  const providedToken = req.headers['x-hook-token'];
  if (providedToken !== hookToken) {
    return res.status(401).json({ error: 'Unauthorized' }) as any;
  }
  
  next();
}

/**
 * Cache control headers for session data
 */
export function attachSessionCacheHeaders(maxAgeSeconds: number = 3600) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}`);
    next();
  };
}
