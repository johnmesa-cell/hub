import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { globalRateLimit, loginRateLimit } from './middleware/rate-limit.middleware';
import { authRouter } from './routes/auth.routes';
import { projectsRouter } from './routes/projects.routes';
import { errorMiddleware } from './middleware/error.middleware';

const app = express();

const allowedOrigins = env.allowedOrigins.split(',').map((origin) => origin.trim()).filter(Boolean);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"]
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: false
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS: origen no permitido -> ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(globalRateLimit);
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/healthz', (_request, response) => {
  response.json({ ok: true, service: 'hub-backend' });
});

app.use('/auth/login', loginRateLimit);
app.use('/auth', authRouter);
app.use('/projects', projectsRouter);

app.use(errorMiddleware);

app.listen(env.port, () => {
  console.log(`hub-backend listening on ${env.port}`);
});
