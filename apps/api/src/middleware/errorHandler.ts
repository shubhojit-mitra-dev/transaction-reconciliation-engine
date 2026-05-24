import { Request, Response, NextFunction } from 'express';
import { logger } from '@repo/logger';

/**
 * Express 404 handler — catches any request that fell through all routes.
 * Must be mounted AFTER all routers.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
}

/**
 * Express global error handler — catches any error passed via next(err).
 * The 4-argument signature is required by Express to recognise it as an error handler.
 * Must be mounted LAST, after notFoundHandler.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error('Unhandled error', {
    method: req.method,
    path: req.path,
    error: err.message,
    stack: err.stack,
  });

  res.status(500).json({ error: 'An unexpected internal server error occurred' });
}
