import { useEffect, useState } from 'react';
import { getWsUrl } from '../api/client';
import { firebaseAuth } from '../firebase';
import type { MetricsSnapshot } from '../types';

type MetricsWsMessage =
  | { type: 'auth_ok'; uid: string }
  | ({ type: 'metrics' } & MetricsSnapshot);

export function useMetricsSocket() {
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const user = firebaseAuth.currentUser;
    if (!user) {
      setMetrics(null);
      setConnected(false);
      return;
    }

    let tokenRefreshInterval: NodeJS.Timeout | null = null;

    const connect = async () => {
      const token = await user.getIdToken();
      const socket = new WebSocket(`${getWsUrl()}/metrics/live`);

      socket.addEventListener('open', () => {
        setConnected(true);
        socket.send(JSON.stringify({ type: 'auth', token }));
      });

      socket.addEventListener('close', () => {
        setConnected(false);
        if (tokenRefreshInterval) clearInterval(tokenRefreshInterval);
      });

      socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data as string) as MetricsWsMessage;
        if (message.type === 'auth_ok') {
          return;
        }
        if (message.type === 'metrics') {
          setMetrics({ server1: message.server1, server2: message.server2 });
        }
      });

      // Renovar token cada 50 minutos
      tokenRefreshInterval = setInterval(async () => {
        const newToken = await user.getIdToken(true);
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'auth', token: newToken }));
        }
      }, 50 * 60 * 1000);

      return socket;
    };

    let socket: WebSocket | null = null;
    void connect().then((ws) => {
      socket = ws;
    });

    return () => {
      if (tokenRefreshInterval) clearInterval(tokenRefreshInterval);
      if (socket) socket.close();
    };
  }, []);

  return { metrics, connected };
}
