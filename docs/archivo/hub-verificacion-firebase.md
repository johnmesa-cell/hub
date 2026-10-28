> **Histórico:** este documento describe una implementación anterior y no representa la arquitectura actual del proyecto.

# Hub — Documento de Verificación y Migración a Firebase Auth
## Checklist completo + Eliminación de BD local de usuarios + Google OAuth

> **Propósito:** Este documento es una guía de verificación y migración para ser ejecutada por
> un agente de desarrollo directamente sobre el repositorio `johnmesa-cell/hub`.
> Debe recorrerse de arriba a abajo, verificando cada punto y aplicando los cambios indicados.
>
> **Decisión arquitectural clave:** Se elimina la tabla `users` y toda la lógica de
> username/password del backend. La autenticación pasa 100% a Firebase Auth con Google OAuth.
> La tabla `projects` y `audit_log` en SQLite se conservan.

---

## PARTE 1 — Inventario del estado actual (leer antes de modificar)

### Archivos que serán ELIMINADOS o vaciados

| Archivo | Razón |
|---|---|
| `backend/src/services/auth.service.ts` | Lógica JWT propia → reemplazar por verificación Firebase |
| `backend/src/db/migrations/001_create_tables.sql` | Tabla `users` → eliminar; `projects` y `audit_log` → conservar |
| `frontend/src/context/AuthContext.tsx` | Auth propio → reemplazar por Firebase SDK |
| `frontend/src/pages/Login.tsx` | Formulario usuario/password → reemplazar por botón Google |
| `frontend/src/hooks/useAuth.ts` | Envuelve AuthContext propio → reemplazar |

### Archivos que serán MODIFICADOS

| Archivo | Cambio |
|---|---|
| `backend/src/index.ts` | Quitar `cors()` sin opciones, agregar rate limit, helmet configurado |
| `backend/src/middleware/auth.middleware.ts` | Verificar Firebase ID Token en lugar de JWT propio |
| `backend/src/routes/auth.routes.ts` | Eliminar `/login`, `/logout`, `/introspect`; conservar solo `/me` |
| `backend/src/db/database.ts` | Eliminar funciones de users (`getUserByUsername`, etc.); conservar projects |
| `backend/src/config/env.ts` | Agregar `FIREBASE_PROJECT_ID`; eliminar `JWT_SECRET`, `ADMIN_*` |
| `backend/src/ws/metrics.ws.ts` | Verificar Firebase ID Token en lugar de JWT propio |
| `frontend/src/api/client.ts` | Token viene de Firebase en lugar del contexto propio |
| `frontend/src/App.tsx` | Router con Firebase `onAuthStateChanged` |
| `frontend/src/pages/Dashboard.tsx` | Usar Firebase user en lugar de AuthContext propio |
| `nginx/hub.conf` | Agregar security headers + rate limiting + separar frontend de API |

### Archivos que se CREAN nuevos

| Archivo | Propósito |
|---|---|
| `backend/src/middleware/rate-limit.middleware.ts` | Rate limiting Express |
| `backend/src/middleware/validate.middleware.ts` | Validación Zod |
| `backend/src/schemas/project.schema.ts` | Schema Zod para proyectos |
| `backend/src/middleware/audit.middleware.ts` | Escribe en audit_log |
| `frontend/src/firebase.ts` | Inicialización Firebase + Google provider |
| `frontend/src/components/ProtectedRoute.tsx` | Guard de rutas privadas |
| `docs/API.md` | Documentación de endpoints |
| `docs/ARCHITECTURE.md` | Diagrama de arquitectura |

---

## PARTE 2 — Dependencias a instalar

### Backend

```bash
cd backend

# Instalar Firebase Admin SDK
npm install firebase-admin

# Instalar nuevas dependencias de seguridad
npm install express-rate-limit zod

# Desinstalar dependencias que ya no se usan
npm uninstall jsonwebtoken bcryptjs
npm uninstall @types/jsonwebtoken @types/bcryptjs
```

### Frontend

```bash
cd frontend

# Instalar Firebase SDK
npm install firebase

# Desinstalar react-router-dom si no está (verificar package.json primero)
# Si no tiene react-router-dom, agregarlo:
npm install react-router-dom
npm install -D @types/react-router-dom
```

---

## PARTE 3 — Configuración de Firebase (hacer antes del código)

### 3.1 Crear proyecto Firebase

1. Ir a https://console.firebase.google.com
2. Crear nuevo proyecto: `hub-tudominio` (o el nombre que prefieras)
3. En **Authentication > Sign-in method**: habilitar **Google**
4. En **Project Settings > General**: copiar el `Project ID`
5. En **Project Settings > General > Your apps**: agregar app Web
   - Nickname: `hub-frontend`
   - Copiar el objeto `firebaseConfig`
6. En **Project Settings > Service accounts**: generar nueva clave privada
   - Descargar el archivo JSON
   - Extraer los valores para las variables de entorno del backend

### 3.2 Dominios autorizados en Firebase

En **Authentication > Settings > Authorized domains**, agregar:
- `localhost`
- `tudominio.com`
- `hub.tudominio.com`

### 3.3 Variables de entorno resultantes

**`backend/.env`** (agregar, no subir a git):

```
NODE_ENV=production
PORT=3001
FIREBASE_PROJECT_ID=tu-proyecto-firebase
ALLOWED_ORIGINS=https://hub.tudominio.com,https://tudominio.com,http://localhost:5173
DB_PATH=/data/hub.db
AGENT_URL=http://IP_SERVIDOR_2:3002
AGENT_KEY=GENERAR_CON_openssl_rand_-hex_32
```

**`frontend/.env`** (agregar, no subir a git):

```
VITE_API_URL=https://hub.tudominio.com/api
VITE_WS_URL=wss://hub.tudominio.com
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=tu-proyecto-firebase.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu-proyecto-firebase
VITE_FIREBASE_APP_ID=1:123456:web:abc123
```

**`backend/.env.example`** (actualizar en git):

```
NODE_ENV=production
PORT=3001
FIREBASE_PROJECT_ID=REEMPLAZAR_CON_PROJECT_ID_DE_FIREBASE
ALLOWED_ORIGINS=https://hub.tudominio.com,https://tudominio.com
DB_PATH=/data/hub.db
AGENT_URL=http://IP_SERVIDOR_2:3002
AGENT_KEY=GENERAR_CON_openssl_rand_-hex_32
```

**`frontend/.env.example`** (actualizar en git):

```
VITE_API_URL=https://hub.tudominio.com/api
VITE_WS_URL=wss://hub.tudominio.com
VITE_FIREBASE_API_KEY=REEMPLAZAR
VITE_FIREBASE_AUTH_DOMAIN=REEMPLAZAR
VITE_FIREBASE_PROJECT_ID=REEMPLAZAR
VITE_FIREBASE_APP_ID=REEMPLAZAR
```

---

## PARTE 4 — Cambios en el Backend

### 4.1 `backend/src/config/env.ts` — REEMPLAZAR COMPLETO

```typescript
import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error(`Variable de entorno requerida no definida: ${key}`);
  }
  return value ?? '';
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3001),
  firebaseProjectId: requireEnv('FIREBASE_PROJECT_ID'),
  agentUrl: process.env.AGENT_URL ?? '',
  agentKey: process.env.AGENT_KEY ?? '',
  dbPath: process.env.DB_PATH ?? './data/hub.db',
  allowedOrigins: process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173',
};
```

### 4.2 `backend/src/db/migrations/001_create_tables.sql` — REEMPLAZAR COMPLETO

Eliminar tabla `users`. Conservar `projects` y `audit_log`.
El `user_id` en `audit_log` ahora guarda el `uid` de Firebase (string, no INTEGER FK).

```sql
-- Proyectos del portal (sin cambios en estructura)
CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  url         TEXT NOT NULL,
  description TEXT,
  icon        TEXT,
  active      INTEGER DEFAULT 1,
  sort_order  INTEGER DEFAULT 0
);

-- Audit log: firebase_uid en lugar de FK a users
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  firebase_uid TEXT,
  action      TEXT NOT NULL,
  ip          TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4.3 `backend/src/db/database.ts` — REEMPLAZAR COMPLETO

Eliminar todo lo relacionado con `users`. Conservar projects. Actualizar audit_log.

```typescript
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { env } from '../config/env';
import type { Project } from '../types';

const dataDir = path.dirname(env.dbPath);
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(env.dbPath);
db.pragma('journal_mode = WAL');

const schemaPath = path.join(__dirname, 'migrations', '001_create_tables.sql');
db.exec(fs.readFileSync(schemaPath, 'utf8'));

// Seed de proyectos por defecto
const defaultProjects = [
  { name: 'Hub',       slug: 'hub',        url: 'https://tudominio.com',           description: 'Portal central',               icon: '◆', active: 1, sort_order: 0 },
  { name: 'Alex',      slug: 'alex',       url: 'https://alex.tudominio.com',      description: 'Proyecto principal de Alex',   icon: '◈', active: 1, sort_order: 1 },
  { name: 'Proyecto X',slug: 'proyectox',  url: 'https://proyectox.tudominio.com', description: 'Servicio externo enrutable',   icon: '⬡', active: 1, sort_order: 2 },
  { name: 'DB Admin',  slug: 'db-admin',   url: 'https://db-admin.tudominio.com',  description: 'Administración de datos',       icon: '◍', active: 1, sort_order: 3 },
];

function seedProjects(): void {
  const count = db.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number };
  if (count.count > 0) return;
  const insert = db.prepare(
    'INSERT INTO projects (name, slug, url, description, icon, active, sort_order) VALUES (@name, @slug, @url, @description, @icon, @active, @sort_order)'
  );
  db.transaction((projects: typeof defaultProjects) => {
    for (const p of projects) insert.run(p);
  })(defaultProjects);
}

seedProjects();

// --- Audit Log ---
export function writeAuditLog(firebaseUid: string | null, action: string, ip: string): void {
  db.prepare('INSERT INTO audit_log (firebase_uid, action, ip) VALUES (?, ?, ?)').run(firebaseUid, action, ip);
}

// --- Projects ---
export function listProjects(includeInactive = false): Project[] {
  const sql = includeInactive
    ? 'SELECT * FROM projects ORDER BY sort_order ASC, id ASC'
    : 'SELECT * FROM projects WHERE active = 1 ORDER BY sort_order ASC, id ASC';
  return db.prepare(sql).all() as Project[];
}

export function getProjectById(id: number): Project | undefined {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
}

export function createProject(project: Omit<Project, 'id'>): Project {
  const info = db.prepare(
    'INSERT INTO projects (name, slug, url, description, icon, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(project.name, project.slug, project.url, project.description, project.icon, project.active, project.sort_order);
  return getProjectById(Number(info.lastInsertRowid)) as Project;
}

export function updateProject(id: number, project: Partial<Omit<Project, 'id'>>): Project | undefined {
  const current = getProjectById(id);
  if (!current) return undefined;
  const next = { ...current, ...project };
  db.prepare(
    'UPDATE projects SET name=?, slug=?, url=?, description=?, icon=?, active=?, sort_order=? WHERE id=?'
  ).run(next.name, next.slug, next.url, next.description, next.icon, next.active, next.sort_order, id);
  return getProjectById(id);
}

export function deactivateProject(id: number): boolean {
  return db.prepare('UPDATE projects SET active = 0 WHERE id = ?').run(id).changes > 0;
}
```

### 4.4 `backend/src/services/auth.service.ts` — REEMPLAZAR COMPLETO

Eliminar toda la lógica JWT. Verificar Firebase ID Token.

```typescript
import * as admin from 'firebase-admin';
import { env } from '../config/env';

// Inicializar Firebase Admin una sola vez
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: env.firebaseProjectId,
  });
}

export interface FirebaseUser {
  uid: string;
  email: string | undefined;
  name: string | undefined;
}

export async function verifyFirebaseToken(idToken: string): Promise<FirebaseUser | null> {
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name as string | undefined,
    };
  } catch {
    return null;
  }
}
```

> **Nota para el agente:** Firebase Admin SDK usa `GOOGLE_APPLICATION_CREDENTIALS` como variable
> de entorno por defecto para `applicationDefault()`. En el servidor de producción, crear el
> archivo de credenciales de la service account descargada de Firebase y apuntar la variable:
> `GOOGLE_APPLICATION_CREDENTIALS=/ruta/al/serviceAccountKey.json`
> En Docker, montar ese archivo como volumen secreto.

### 4.5 `backend/src/middleware/auth.middleware.ts` — REEMPLAZAR COMPLETO

```typescript
import type { NextFunction, Request, Response } from 'express';
import { verifyFirebaseToken, type FirebaseUser } from '../services/auth.service';

// Extender el tipo Request de Express
declare global {
  namespace Express {
    interface Request {
      firebaseUser?: FirebaseUser;
    }
  }
}

export async function requireAuth(request: Request, response: Response, next: NextFunction): Promise<void> {
  const authorization = request.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;

  if (!token) {
    response.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = await verifyFirebaseToken(token);
  if (!user) {
    response.status(401).json({ error: 'Unauthorized' });
    return;
  }

  request.firebaseUser = user;
  next();
}
```

> **Nota:** Si `backend/src/types/index.ts` o similar declara `authUser` en el Request,
> reemplazar esa declaración por `firebaseUser?: FirebaseUser`.

### 4.6 `backend/src/routes/auth.routes.ts` — REEMPLAZAR COMPLETO

Firebase maneja login/logout en el cliente. El backend solo expone `/me` para verificar sesión.

```typescript
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';

export const authRouter = Router();

// Solo verificar que el token es válido y devolver datos del usuario
authRouter.get('/me', requireAuth, (request, response) => {
  response.json({ user: request.firebaseUser });
});
```

### 4.7 `backend/src/ws/metrics.ws.ts` — REEMPLAZAR COMPLETO

Verificar Firebase ID Token en el handshake del WebSocket.

```typescript
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
    websocketServer.handleUpgrade(request, socket, head, (ws) => {
      websocketServer.emit('connection', ws, request);
    });
  });

  websocketServer.on('connection', (websocket) => {
    let authenticated = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    // Timeout: 5 segundos para autenticar
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
                interval = setInterval(() => { void sendMetrics(); }, 2000);
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
```

### 4.8 Crear `backend/src/middleware/rate-limit.middleware.ts`

```typescript
import rateLimit from 'express-rate-limit';

export const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta en 15 minutos.' },
});

// Rate limit para rutas de API sensibles (metrics, projects write)
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Límite de API alcanzado.' },
});
```

### 4.9 Crear `backend/src/middleware/validate.middleware.ts`

```typescript
import type { NextFunction, Request, Response } from 'express';
import { type ZodSchema } from 'zod';

export function validate(schema: ZodSchema) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      const details = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      response.status(422).json({ error: 'Datos inválidos', details });
      return;
    }
    request.body = result.data;
    next();
  };
}
```

### 4.10 Crear `backend/src/schemas/project.schema.ts`

```typescript
import { z } from 'zod';

export const createProjectSchema = z.object({
  name:        z.string().min(1).max(100).trim(),
  slug:        z.string().min(1).max(60).regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones'),
  url:         z.string().url('URL inválida'),
  description: z.string().max(500).optional().default(''),
  icon:        z.string().max(10).optional().default('◆'),
  active:      z.number().int().min(0).max(1).optional().default(1),
  sort_order:  z.number().int().min(0).optional().default(0),
});

export const updateProjectSchema = createProjectSchema.partial();
```

### 4.11 Crear `backend/src/middleware/audit.middleware.ts`

```typescript
import type { NextFunction, Request, Response } from 'express';
import { writeAuditLog } from '../db/database';

export function auditAction(action: string) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const uid = request.firebaseUser?.uid ?? null;
    const ip = (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? request.socket.remoteAddress
      ?? 'unknown';
    writeAuditLog(uid, action, ip);
    next();
  };
}
```

### 4.12 `backend/src/routes/projects.routes.ts` — ACTUALIZAR

Agregar validación Zod + audit log:

```typescript
import { Router } from 'express';
import { createProject, deactivateProject, listProjects, updateProject } from '../db/database';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { auditAction } from '../middleware/audit.middleware';
import { createProjectSchema, updateProjectSchema } from '../schemas/project.schema';

export const projectsRouter = Router();

// Público: lista de proyectos activos (Home lo consume sin auth)
projectsRouter.get('/', (_request, response) => {
  response.json({ projects: listProjects() });
});

// Privado: crear proyecto
projectsRouter.post(
  '/',
  requireAuth,
  validate(createProjectSchema),
  auditAction('PROJECT_CREATE'),
  (request, response) => {
    const project = createProject(request.body as Parameters<typeof createProject>[0]);
    response.status(201).json({ project });
  }
);

// Privado: actualizar proyecto
projectsRouter.put(
  '/:id',
  requireAuth,
  validate(updateProjectSchema),
  auditAction('PROJECT_UPDATE'),
  (request, response) => {
    const id = Number(request.params.id);
    const updated = updateProject(id, request.body as Record<string, unknown>);
    if (!updated) {
      response.status(404).json({ error: 'Project not found' });
      return;
    }
    response.json({ project: updated });
  }
);

// Privado: desactivar proyecto
projectsRouter.delete(
  '/:id',
  requireAuth,
  auditAction('PROJECT_DELETE'),
  (request, response) => {
    const id = Number(request.params.id);
    if (!deactivateProject(id)) {
      response.status(404).json({ error: 'Project not found' });
      return;
    }
    response.status(204).send();
  }
);
```

### 4.13 `backend/src/index.ts` — REEMPLAZAR COMPLETO

```typescript
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
import { globalRateLimit } from './middleware/rate-limit.middleware';

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:'],
      connectSrc: ["'self'", 'wss:', 'https://apis.google.com', 'https://*.firebaseapp.com'],
      frameSrc:   ["'none'"],
      objectSrc:  ["'none'"],
    },
  },
  hsts:       { maxAge: 31536000, includeSubDomains: true, preload: true },
  frameguard: { action: 'deny' },
  noSniff:    true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// CORS restrictivo
const allowedOrigins = env.allowedOrigins.split(',').map((o) => o.trim());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS: origen no permitido → ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use(globalRateLimit);

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
  console.log(`hub-backend escuchando en puerto ${env.port}`);
});
```

---

## PARTE 5 — Cambios en el Frontend

### 5.1 Crear `frontend/src/firebase.ts`

```typescript
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey:     import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:  import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId:      import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseApp  = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();

// Forzar selección de cuenta siempre (no re-login automático silencioso)
googleProvider.setCustomParameters({ prompt: 'select_account' });
```

### 5.2 `frontend/src/context/AuthContext.tsx` — REEMPLAZAR COMPLETO

```typescript
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  type User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { firebaseAuth, googleProvider } from '../firebase';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  getToken: () => Promise<string | null>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    getToken: async () => {
      if (!user) return null;
      return user.getIdToken();
    },
    loginWithGoogle: async () => {
      await signInWithPopup(firebaseAuth, googleProvider);
    },
    logout: async () => {
      await signOut(firebaseAuth);
    },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext debe usarse dentro de AuthProvider');
  return ctx;
}
```

### 5.3 `frontend/src/hooks/useAuth.ts` — REEMPLAZAR COMPLETO

```typescript
import { useAuthContext } from '../context/AuthContext';

// Re-export para mantener compatibilidad con todos los componentes
// que ya usan useAuth()
export const useAuth = useAuthContext;
```

### 5.4 `frontend/src/pages/Login.tsx` — REEMPLAZAR COMPLETO

Eliminar formulario username/password. Reemplazar por botón Google.

```typescript
import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';

function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function Login() {
  const { user, loading, loginWithGoogle } = useAuth();

  // Si ya tiene sesión, ir al dashboard directamente
  useEffect(() => {
    if (!loading && user) navigate('/dashboard');
  }, [user, loading]);

  if (loading) {
    return (
      <main className="page page-auth">
        <section className="auth-card">
          <p>Verificando sesión...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page page-auth">
      <section className="auth-card">
        <span className="eyebrow">Acceso administrativo</span>
        <h1>Iniciar sesión</h1>
        <p>Solo usuarios autorizados con cuenta de Google pueden acceder al dashboard.</p>
        <button
          className="primary btn-google"
          onClick={async () => {
            try {
              await loginWithGoogle();
              navigate('/dashboard');
            } catch (err) {
              console.error('Error al iniciar sesión:', err);
            }
          }}
        >
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.2l6.8-6.8C35.8 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.4 13.2 17.8 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17z"/>
            <path fill="#FBBC05" d="M10.6 28.6A14.9 14.9 0 0 1 9.5 24c0-1.6.3-3.1.8-4.6L2.4 13.3A24 24 0 0 0 0 24c0 3.9.9 7.5 2.7 10.7l7.9-6.1z"/>
            <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2 1.4-4.6 2.2-7.7 2.2-6.2 0-11.5-4.2-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/>
          </svg>
          Continuar con Google
        </button>
      </section>
    </main>
  );
}
```

### 5.5 `frontend/src/api/client.ts` — REEMPLAZAR COMPLETO

```typescript
import { firebaseAuth } from '../firebase';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export function getApiUrl(): string { return API_URL; }

export function getWsUrl(): string {
  const configured = import.meta.env.VITE_WS_URL ?? API_URL;
  return configured.replace(/^http/i, 'ws');
}

async function getFirebaseToken(): Promise<string | null> {
  const user = firebaseAuth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
  _legacyToken?: string  // Parámetro ignorado — conservado por compatibilidad de firma
): Promise<T> {
  const token = await getFirebaseToken();

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  // Sesión expirada o no autorizado
  if (response.status === 401) {
    window.location.href = '/login';
    throw new Error('Sesión expirada');
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}
```

### 5.6 `frontend/src/hooks/useMetricsSocket.ts` — REEMPLAZAR COMPLETO

```typescript
import { useEffect, useState } from 'react';
import { getWsUrl } from '../api/client';
import { firebaseAuth } from '../firebase';
import type { MetricsSnapshot } from '../types';

export function useMetricsSocket(
  _legacyToken?: string | null  // Ignorado — se obtiene de Firebase directamente
) {
  const [metrics,   setMetrics]   = useState<MetricsSnapshot | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const user = firebaseAuth.currentUser;
    if (!user) {
      setMetrics(null);
      setConnected(false);
      return;
    }

    let socket: WebSocket;
    let interval: ReturnType<typeof setInterval> | null = null;

    void user.getIdToken().then((token) => {
      socket = new WebSocket(`${getWsUrl()}/metrics/live`);

      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({ type: 'auth', token }));
      });

      socket.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          server1?: unknown;
          server2?: unknown;
        };
        if (msg.type === 'auth_ok') {
          setConnected(true);
          return;
        }
        if (msg.type === 'metrics') {
          setMetrics(msg as unknown as MetricsSnapshot);
        }
      });

      socket.addEventListener('close', () => {
        setConnected(false);
        if (interval) clearInterval(interval);
      });

      // Renovar token Firebase cada 50 minutos (expira cada 60)
      interval = setInterval(() => {
        void user.getIdToken(true).then((freshToken) => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'auth', token: freshToken }));
          }
        });
      }, 50 * 60 * 1000);
    });

    return () => {
      if (socket) socket.close();
      if (interval) clearInterval(interval);
    };
  }, []);

  return { metrics, connected };
}
```

### 5.7 `frontend/src/App.tsx` — REEMPLAZAR COMPLETO

```typescript
import { useEffect, useState } from 'react';
import { AuthProvider, useAuthContext } from './context/AuthContext';
import { Home }      from './pages/Home';
import { Login }     from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import './styles.css';

function AppRouter() {
  const { user, loading } = useAuthContext();
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <span>Cargando...</span>
      </div>
    );
  }

  if (pathname === '/login') {
    // Si ya autenticado, redirigir al dashboard
    if (user) {
      window.history.replaceState({}, '', '/dashboard');
      return <Dashboard />;
    }
    return <Login />;
  }

  if (pathname === '/dashboard') {
    // Ruta protegida: si no hay sesión, ir a login
    if (!user) {
      window.history.replaceState({}, '', '/login');
      return <Login />;
    }
    return <Dashboard />;
  }

  return <Home />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
```

### 5.8 `frontend/src/pages/Dashboard.tsx` — ACTUALIZAR

Reemplazar referencias a `token` por `getToken` de Firebase:

```typescript
// Cambiar el useEffect de carga de proyectos:
useEffect(() => {
  if (!user) {
    navigate('/login');
    return;
  }
  // apiRequest ahora obtiene el token de Firebase internamente
  void apiRequest<{ projects: Project[] }>('/projects')
    .then((response) => setProjects(response.projects))
    .catch(() => setProjects([]));
}, [user]);

// El hook useMetricsSocket ya no necesita token como argumento:
const { metrics, connected } = useMetricsSocket();

// Mostrar nombre real de Google en lugar de username:
<p>
  Sesión activa como {user?.displayName ?? user?.email ?? 'Admin'} ·{' '}
  {connected ? 'WebSocket conectado' : 'Conectando...'}
</p>
```

### 5.9 Actualizar `frontend/src/types.ts`

Reemplazar `AuthUser` por tipo Firebase:

```typescript
// Eliminar:
// export interface AuthUser { id: number; username: string; role: string; }

// El tipo User de Firebase viene directo del SDK:
// import type { User } from 'firebase/auth';
// No necesita declararse aquí
```

---

## PARTE 6 — Nginx actualizado

### `nginx/hub.conf` — REEMPLAZAR COMPLETO

```nginx
# Rate limiting (agregar en el contexto http del nginx.conf principal del servidor)
# limit_req_zone $binary_remote_addr zone=hub_api:10m rate=30r/m;

server {
    listen 80;
    server_name tudominio.com www.tudominio.com hub.tudominio.com;

    # Security headers
    add_header X-Frame-Options            "DENY"                            always;
    add_header X-Content-Type-Options     "nosniff"                        always;
    add_header X-XSS-Protection           "1; mode=block"                  always;
    add_header Referrer-Policy            "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy         "camera=(), microphone=(), geolocation=()" always;
    # Activar HSTS solo después de configurar HTTPS con Certbot:
    # add_header Strict-Transport-Security  "max-age=31536000; includeSubDomains; preload" always;

    # Frontend (React/Vite build estático)
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    }

    # API backend (REST)
    location /api/ {
        # limit_req zone=hub_api burst=20 nodelay;
        proxy_pass         http://127.0.0.1:3001/;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    }

    # WebSocket métricas
    location /metrics/live {
        proxy_pass             http://127.0.0.1:3001/metrics/live;
        proxy_http_version     1.1;
        proxy_set_header       Upgrade    $http_upgrade;
        proxy_set_header       Connection "upgrade";
        proxy_set_header       Host       $host;
        proxy_read_timeout     3600s;
    }
}
```

---

## PARTE 7 — Tipos TypeScript del backend

Verificar `backend/src/types/index.ts` o `backend/src/types.ts`. Debe quedar así:

```typescript
// Eliminar AuthUser (era del sistema propio de auth)

export interface Project {
  id:          number;
  name:        string;
  slug:        string;
  url:         string;
  description: string | null;
  icon:        string | null;
  active:      number;
  sort_order:  number;
}

export interface ServerMetrics {
  cpu:     { usage: number; cores: number };
  ram:     { used: number; total: number; percent: number };
  disk:    { used: number; total: number; percent: number };
  network: { rx_bytes: number; tx_bytes: number };
  uptime:  number;
}

// Extender Request de Express con firebaseUser
// (puede ir aquí o en auth.middleware.ts — elegir un solo lugar)
import type { FirebaseUser } from '../services/auth.service';
declare global {
  namespace Express {
    interface Request {
      firebaseUser?: FirebaseUser;
    }
  }
}
```

---

## PARTE 8 — Checklist de verificación completo

El agente debe marcar cada ítem después de aplicar el cambio:

### Backend

- [ ] `npm uninstall jsonwebtoken bcryptjs @types/jsonwebtoken @types/bcryptjs` ejecutado
- [ ] `npm install firebase-admin express-rate-limit zod` ejecutado
- [ ] `config/env.ts` no tiene `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`
- [ ] `config/env.ts` tiene `firebaseProjectId` y `allowedOrigins`
- [ ] `db/migrations/001_create_tables.sql` no tiene tabla `users`
- [ ] `db/database.ts` no tiene `getUserByUsername`, `getUserById`, `markLastLogin`, `seedAdmin`
- [ ] `db/database.ts` tiene `writeAuditLog(firebaseUid, action, ip)`
- [ ] `services/auth.service.ts` solo tiene `verifyFirebaseToken` (sin bcrypt, sin JWT)
- [ ] `middleware/auth.middleware.ts` usa `verifyFirebaseToken` (sin JWT verify)
- [ ] `middleware/auth.middleware.ts` agrega `request.firebaseUser` (no `request.authUser`)
- [ ] `middleware/rate-limit.middleware.ts` existe y exporta `globalRateLimit`
- [ ] `middleware/validate.middleware.ts` existe y exporta `validate`
- [ ] `middleware/audit.middleware.ts` existe y exporta `auditAction`
- [ ] `schemas/project.schema.ts` existe con `createProjectSchema` y `updateProjectSchema`
- [ ] `routes/auth.routes.ts` solo tiene GET `/me` (sin `/login`, `/logout`, `/introspect`)
- [ ] `routes/projects.routes.ts` tiene `validate()` y `auditAction()` en rutas de escritura
- [ ] `index.ts` usa Helmet configurado (no `helmet()` sin opciones)
- [ ] `index.ts` usa CORS restrictivo con `allowedOrigins`
- [ ] `index.ts` aplica `globalRateLimit` como middleware global
- [ ] `ws/metrics.ws.ts` verifica Firebase token por mensaje (no query param)
- [ ] `npm run build` compila sin errores TypeScript
- [ ] `npx tsc --noEmit` pasa sin errores

### Frontend

- [ ] `npm install firebase` ejecutado
- [ ] `firebase.ts` existe con `firebaseAuth` y `googleProvider`
- [ ] Variables `VITE_FIREBASE_*` en `.env` y `.env.example`
- [ ] `AuthContext.tsx` usa `onAuthStateChanged` de Firebase (sin useState para username/password)
- [ ] `AuthContext.tsx` expone `loginWithGoogle`, `logout`, `getToken`, `loading`
- [ ] `hooks/useAuth.ts` re-exporta `useAuthContext` (para compatibilidad)
- [ ] `pages/Login.tsx` tiene botón Google (sin campos username/password)
- [ ] `api/client.ts` obtiene token de `firebaseAuth.currentUser.getIdToken()` (no de prop externa)
- [ ] `api/client.ts` redirige a `/login` en respuesta 401
- [ ] `hooks/useMetricsSocket.ts` obtiene token de Firebase (no query param en URL)
- [ ] `hooks/useMetricsSocket.ts` renueva token cada 50 minutos
- [ ] `App.tsx` usa `loading` de AuthContext antes de renderizar rutas
- [ ] `pages/Dashboard.tsx` usa `user` de Firebase (no `token` como prop de auth)
- [ ] `types.ts` no declara `AuthUser` propio
- [ ] `npm run build` compila sin errores TypeScript

### Nginx

- [ ] `nginx/hub.conf` tiene security headers (`X-Frame-Options`, `X-Content-Type-Options`, etc.)
- [ ] `nginx/hub.conf` tiene `location /api/` separado de `location /`
- [ ] `nginx/hub.conf` tiene `location /metrics/live` con soporte WebSocket
- [ ] `nginx/alex.conf` tiene security headers
- [ ] `nginx/proyectox.conf` tiene security headers
- [ ] Comentarios de `limit_req_zone` presentes y listos para activar

### Variables de entorno

- [ ] `.env.example` raíz actualizado (sin JWT_SECRET ni ADMIN_*)
- [ ] `backend/.env.example` tiene `FIREBASE_PROJECT_ID` y `ALLOWED_ORIGINS`
- [ ] `frontend/.env.example` tiene todas las variables `VITE_FIREBASE_*`
- [ ] Los archivos `.env` reales NO están en git (verificar `.gitignore`)

### Documentación

- [ ] `docs/API.md` creado (ver Fase 2 para contenido)
- [ ] `docs/ARCHITECTURE.md` actualizado con Firebase Auth en el flujo

---

## PARTE 9 — Notas de despliegue para Firebase Admin en producción

Firebase Admin SDK necesita credenciales para verificar tokens en el servidor.
Hay dos opciones:

**Opción A — Service Account Key (recomendada para Oracle Cloud):**

1. Descargar `serviceAccountKey.json` desde Firebase Console > Project Settings > Service Accounts
2. Subir el archivo al servidor en `/etc/hub/serviceAccountKey.json`
3. En el `docker-compose.prod.yml`, montar como volumen:

```yaml
backend:
  volumes:
    - /etc/hub/serviceAccountKey.json:/run/secrets/serviceAccountKey.json:ro
  environment:
    GOOGLE_APPLICATION_CREDENTIALS: /run/secrets/serviceAccountKey.json
```

**Opción B — Variables de entorno individuales (alternativa):**

Modificar `auth.service.ts` para inicializar con credenciales explícitas:

```typescript
admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});
```

Y agregar al `.env`:
```
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@tu-proyecto.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

