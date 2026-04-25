import { Router } from 'express';
import { login, logout, verifyToken } from '../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';

export const authRouter = Router();

authRouter.post('/login', (request, response) => {
  const { username, password } = request.body as { username?: string; password?: string };

  if (!username || !password) {
    response.status(400).json({ error: 'username and password are required' });
    return;
  }

  const result = login(username, password);
  if (!result) {
    response.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  response.json(result);
});

authRouter.post('/logout', requireAuth, (request, response) => {
  const authorization = request.header('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (token) {
    logout(token);
  }

  response.status(204).send();
});

authRouter.get('/me', requireAuth, (request, response) => {
  response.json({ user: request.authUser });
});

authRouter.post('/introspect', (request, response) => {
  const { token } = request.body as { token?: string };
  if (!token) {
    response.status(400).json({ error: 'token is required' });
    return;
  }

  response.json({ user: verifyToken(token) });
});
