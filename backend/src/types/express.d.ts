import type { FirebaseUser } from '../services/auth.service';

declare global {
  namespace Express {
    interface Request {
      firebaseUser?: FirebaseUser;
    }
  }
}

export {};
