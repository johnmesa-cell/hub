import express from 'express';
import http from 'node:http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { authRouter } from './routes/auth.routes';
import { metricsRouter } from './routes/metrics.routes';
import { projectsRouter } from './routes/projects.routes';
import { errorMiddleware } from './middleware/error.middleware';
import { attachMetricsWebSocket } from './ws/metrics.ws';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/healthz', (_request, response) => {
  response.json({ ok: true, service: 'hub-backend' });
});

app.use('/auth', authRouter);
app.use('/metrics', metricsRouter);
app.use('/projects', projectsRouter);

app.use(errorMiddleware);

const server = http.createServer(app);
attachMetricsWebSocket(server);

server.listen(env.port, () => {
  console.log(`hub-backend listening on ${env.port}`);
});
