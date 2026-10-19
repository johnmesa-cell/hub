import type { NextFunction, Request, Response } from 'express';
import { verifyFirebaseToken, type FirebaseUser } from '../services/auth.service';
import { env } from '../config/env';

declare global {
  namespace Express {
    interface Request {
      firebaseUser?: FirebaseUser;
    }
  }
}

function isAllowed(user: FirebaseUser): boolean {
  const allowedEmails = env.allowedEmails.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  return allowedEmails.length === 0 || (user.email ? allowedEmails.includes(user.email.toLowerCase()) : false);
}

function getToken(request: Request): string | undefined {
  const authorization = request.header('authorization');
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
}

export async function requireAuth(request: Request, response: Response, next: NextFunction): Promise<void> {
  const token = getToken(request);

  if (!token) {
    response.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = await verifyFirebaseToken(token);
  if (!user || !isAllowed(user)) {
    response.status(401).json({ error: 'Unauthorized' });
    return;
  }

  request.firebaseUser = user;
  next();
}

export async function optionalAuth(request: Request, _response: Response, next: NextFunction): Promise<void> {
  const token = getToken(request);
  if (token) {
    const user = await verifyFirebaseToken(token);
    if (user && isAllowed(user)) request.firebaseUser = user;
  }
  next();
}
