import type { NextFunction, Request, Response } from 'express';

export function errorMiddleware(error: unknown, request: Request, response: Response, _next: NextFunction): void {
  console.error(error);
  response.status(500).json({
    error: 'Internal Server Error',
    path: request.path
  });
}
