import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { env } from './env';

if (getApps().length === 0) {
  initializeApp({
    credential: cert(env.googleApplicationCredentials),
  });
}