import { firebaseAuth } from '../firebase';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export function getApiUrl(): string {
  return API_URL;
}

export function getWsUrl(): string {
  const configured = import.meta.env.VITE_WS_URL ?? API_URL;
  return configured.replace(/^http/i, 'ws');
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const user = firebaseAuth.currentUser;
  const token = user ? await user.getIdToken() : null;

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {})
    }
  });

  if (response.status === 401) {
    window.history.pushState({}, '', '/login');
    window.dispatchEvent(new PopStateEvent('popstate'));
    throw new Error('Sesión expirada');
  }

  if (!response.ok) {
    const payload = await response
      .json()
      .catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
