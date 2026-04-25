import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';

export const authRouter = Router();

// Solo verificar que el token es válido y devolver datos del usuario
authRouter.get('/me', requireAuth, (request, response) => {
  response.json({ user: request.firebaseUser });
});
