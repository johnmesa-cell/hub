import { useEffect, useState } from 'react';
import { getWsUrl } from '../api/client';
import type { MetricsSnapshot } from '../types';

export function useMetricsSocket(token: string | null) {
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) {
      setMetrics(null);
      setConnected(false);
      return;
    }

    const socket = new WebSocket(`${getWsUrl()}/metrics/live?token=${encodeURIComponent(token)}`);

    socket.addEventListener('open', () => setConnected(true));
    socket.addEventListener('close', () => setConnected(false));
    socket.addEventListener('message', (event) => {
      setMetrics(JSON.parse(event.data) as MetricsSnapshot);
    });

    return () => {
      socket.close();
    };
  }, [token]);

  return { metrics, connected };
}
