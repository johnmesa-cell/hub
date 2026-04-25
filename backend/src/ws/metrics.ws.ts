import type { Server } from 'node:http';
import { parse } from 'node:url';
import { WebSocketServer } from 'ws';
import { verifyToken } from '../services/auth.service';
import { getLocalMetrics } from '../services/metrics.local.service';
import { getRemoteMetrics } from '../services/metrics.remote.service';

export function attachMetricsWebSocket(server: Server): void {
  const websocketServer = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const { pathname, query } = parse(request.url ?? '', true);
    if (pathname !== '/metrics/live') {
      socket.destroy();
      return;
    }

    const token = typeof query.token === 'string' ? query.token : '';
    if (!token || !verifyToken(token)) {
      socket.destroy();
      return;
    }

    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit('connection', websocket, request);
    });
  });

  websocketServer.on('connection', (websocket) => {
    const sendMetrics = async () => {
      const [server1, server2] = await Promise.all([Promise.resolve(getLocalMetrics()), getRemoteMetrics()]);
      websocket.send(JSON.stringify({ server1, server2 }));
    };

    void sendMetrics();
    const interval = setInterval(() => {
      void sendMetrics();
    }, 2000);

    websocket.on('close', () => {
      clearInterval(interval);
    });
  });
}
