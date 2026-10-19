import type { NextFunction, Request, Response } from 'express';
import { writeAuditLog } from '../firestore/projects.firestore';

export function auditAction(action: string) {
  return async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
    const firebaseUid = request.firebaseUser?.uid ?? null;
    const forwardedFor = request.headers['x-forwarded-for'];
    const ip = typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0].trim()
      : request.socket.remoteAddress ?? 'unknown';

    await writeAuditLog(firebaseUid, action, ip);
    next();
  };
}
