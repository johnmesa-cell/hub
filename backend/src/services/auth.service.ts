import * as admin from 'firebase-admin';
import { env } from '../config/env';

export interface FirebaseUser {
  uid: string;
  email: string | undefined;
  name: string | undefined;
}

// Inicializar Firebase Admin una sola vez
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: env.firebaseProjectId,
  });
}

export async function verifyFirebaseToken(idToken: string): Promise<FirebaseUser | null> {
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
    };
  } catch {
    return null;
  }
}
