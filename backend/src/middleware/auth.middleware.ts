import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../services/auth.service';

export function requireAuth(request: Request, response: Response, next: NextFunction): void {
  const authorization = request.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;

  if (!token) {
    response.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = verifyToken(token);
  if (!user) {
    response.status(401).json({ error: 'Unauthorized' });
    return;
  }

  request.authUser = user;
  next();
}
