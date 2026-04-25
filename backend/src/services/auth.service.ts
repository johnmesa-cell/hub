import bcrypt from 'bcryptjs';
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { getUserById, getUserByUsername, markLastLogin } from '../db/database';
import type { AuthUser } from '../types';

const revokedTokens = new Set<string>();

export function login(username: string, password: string): { token: string; user: AuthUser } | null {
  const user = getUserByUsername(username);
  if (!user) {
    return null;
  }

  const passwordMatches = bcrypt.compareSync(password, user.password);
  if (!passwordMatches) {
    return null;
  }

  markLastLogin(user.id);

  const signOptions: SignOptions = { expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'] };
  const token = jwt.sign({ sub: String(user.id), username: user.username, role: user.role }, env.jwtSecret as Secret, signOptions);

  return { token, user: { id: user.id, username: user.username, role: user.role } };
}

export function verifyToken(token: string): AuthUser | null {
  if (revokedTokens.has(token)) {
    return null;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as unknown as { sub: string; username: string; role: string };
    const user = getUserById(Number(payload.sub));
    if (!user) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

export function logout(token: string): void {
  revokedTokens.add(token);
}
