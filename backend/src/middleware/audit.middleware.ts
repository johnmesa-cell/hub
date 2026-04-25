import type { NextFunction, Request, Response } from 'express';
import { writeAuditLog } from '../db/database';

export function auditAction(action: string) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const firebaseUid = request.firebaseUser?.uid ?? null;
    const forwardedFor = request.headers['x-forwarded-for'];
    const ip = typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0].trim()
      : request.socket.remoteAddress ?? 'unknown';

    writeAuditLog(firebaseUid, action, ip);
    next();
  };
}
