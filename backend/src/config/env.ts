import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error(`Variable de entorno requerida no definida: ${key}`);
  }
  return value ?? '';
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3001),
  firebaseProjectId: requireEnv('FIREBASE_PROJECT_ID'),
  allowedOrigins: process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173',
  allowedEmails: process.env.ALLOWED_EMAILS ?? ''
};
