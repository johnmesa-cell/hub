import type { Server } from 'node:http';
import { parse } from 'node:url';
import { WebSocketServer } from 'ws';
import { verifyFirebaseToken } from '../services/auth.service';
import { getLocalMetrics } from '../services/metrics.local.service';
import { getRemoteMetrics } from '../services/metrics.remote.service';

export function attachMetricsWebSocket(server: Server): void {
  const websocketServer = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url ?? '', true);
    if (pathname !== '/metrics/live') {
      socket.destroy();
      return;
    }

    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit('connection', websocket, request);
    });
  });

  websocketServer.on('connection', (websocket) => {
    let authenticated = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const authTimeout = setTimeout(() => {
      if (!authenticated) websocket.close(4001, 'Authentication timeout');
    }, 5000);

    websocket.on('message', (data) => {
      if (!authenticated) {
        void (async () => {
          try {
            const msg = JSON.parse(data.toString()) as { type?: string; token?: string };
            if (msg.type === 'auth' && msg.token) {
              const user = await verifyFirebaseToken(msg.token);
              if (user) {
                authenticated = true;
                clearTimeout(authTimeout);
                websocket.send(JSON.stringify({ type: 'auth_ok', uid: user.uid }));

                const sendMetrics = async () => {
                  const [server1, server2] = await Promise.all([
                    Promise.resolve(getLocalMetrics()),
                    getRemoteMetrics(),
                  ]);
                  if (websocket.readyState === websocket.OPEN) {
                    websocket.send(JSON.stringify({ type: 'metrics', server1, server2 }));
                  }
                };
                void sendMetrics();
                interval = setInterval(() => {
                  void sendMetrics();
                }, 2000);
              } else {
                websocket.close(4001, 'Unauthorized');
              }
            } else {
              websocket.close(4001, 'Invalid auth message');
            }
          } catch {
            websocket.close(4001, 'Invalid message format');
          }
        })();
      }
    });

    websocket.on('close', () => {
      clearTimeout(authTimeout);
      if (interval) clearInterval(interval);
    });
  });
}
