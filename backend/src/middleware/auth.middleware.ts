import type { NextFunction, Request, Response } from 'express';
import { verifyFirebaseToken, type FirebaseUser } from '../services/auth.service';

declare global {
  namespace Express {
    interface Request {
      firebaseUser?: FirebaseUser;
    }
  }
}

export async function requireAuth(request: Request, response: Response, next: NextFunction): Promise<void> {
  const authorization = request.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;

  if (!token) {
    response.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = await verifyFirebaseToken(token);
  if (!user) {
    response.status(401).json({ error: 'Unauthorized' });
    return;
  }

  request.firebaseUser = user;
  next();
}
