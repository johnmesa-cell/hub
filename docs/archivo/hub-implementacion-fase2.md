> **Histórico:** este documento describe una implementación anterior y no representa la arquitectura actual del proyecto.

# Hub — Plan de Implementación Fase 2
## Seguridad (Opción A) + Gaps Pendientes

> **Contexto:** Este documento está basado en la auditoría directa del repositorio `johnmesa-cell/hub`.
> El proyecto ya tiene el 85% del scaffolding funcional. Este plan cubre exactamente lo que falta,
> con código listo para implementar. El agente debe leer este documento de arriba a abajo y ejecutar
> cada sección en orden.

---

## Estado actual del repositorio (resumen de auditoría)

### ✅ Ya implementado y funcional

| Módulo | Archivos | Estado |
|---|---|---|
| Backend server | `backend/src/index.ts` | ✅ Express + HTTP server + WebSocket attach |
| Auth service | `backend/src/services/auth.service.ts` | ✅ JWT en memoria + bcrypt + revocación |
| Auth middleware | `backend/src/middleware/auth.middleware.ts` | ✅ `requireAuth` con Bearer token |
| Auth routes | `backend/src/routes/auth.routes.ts` | ✅ login / logout / me / introspect |
| Projects routes | `backend/src/routes/projects.routes.ts` | ✅ CRUD completo |
| Metrics routes | `backend/src/routes/metrics.routes.ts` | ✅ REST endpoint |
| Database | `backend/src/db/database.ts` | ✅ SQLite (better-sqlite3) con seed |
| Migrations | `backend/src/db/migrations/001_create_tables.sql` | ✅ users + projects + audit_log |
| WebSocket | `backend/src/ws/metrics.ws.ts` | ✅ Auth por token query param, push cada 2s |
| Config | `backend/src/config/env.ts` | ✅ dotenv tipado |
| Frontend pages | `Home.tsx`, `Login.tsx`, `Dashboard.tsx` | ✅ Creadas |
| Frontend components | `NavBar`, `ProjectCard`, `ServerPanel`, `MetricBar`, `MetricGauge` | ✅ Creadas |
| Frontend context | `AuthContext.tsx` | ✅ Creado |
| Frontend hooks | `useAuth.ts`, `useMetricsSocket.ts` | ✅ Creados |
| Frontend API client | `frontend/src/api/client.ts` | ✅ Creado |
| Agent microservicio | `agent/` | ✅ Scaffolding completo |
| Nginx | `nginx/hub.conf`, `nginx/alex.conf`, `nginx/proyectox.conf` | ✅ Creados |
| Docker | `docker-compose.yml`, `docker-compose.prod.yml` | ✅ Creados |

### ⚠️ Gaps detectados (lo que este documento implementa)

1. **Capa de Rate Limiting** — no existe `rateLimit` middleware
2. **Capa de audit_log activa** — la tabla existe en SQL pero nunca se escribe
3. **CORS restrictivo** — `cors()` sin opciones acepta cualquier origen
4. **Validación de inputs** — rutas sin sanitización de cuerpo
5. **Helmet incompleto** — falta configurar CSP
6. **WebSocket auth mejorado** — token en query param (riesgo de log en servidor)
7. **Variables de entorno inseguras** — `JWT_SECRET` y `ADMIN_PASSWORD` con defaults débiles
8. **Rotación de tokens revocados** — el Set `revokedTokens` crece sin límite en memoria
9. **Frontend: rutas protegidas** — `ProtectedRoute` component falta o incompleto
10. **Frontend: manejo de expiración de token** — no hay lógica de re-login automático
11. **Nginx: headers de seguridad** — faltan `X-Frame-Options`, `X-Content-Type-Options`, `HSTS`
12. **Nginx: rate limiting** — no configurado a nivel de proxy
13. **`docs/`** — carpeta vacía, necesita al menos `API.md` y `ARCHITECTURE.md`

---

## SECCIÓN 1 — Backend: Seguridad

### 1.1 Rate Limiting

Instalar dependencia:

```bash
cd backend && npm install express-rate-limit
```

Crear archivo `backend/src/middleware/rate-limit.middleware.ts`:

```typescript
import rateLimit from 'express-rate-limit';

// Límite general: 100 requests por IP cada 15 minutos
export const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta en 15 minutos.' },
});

// Límite estricto para login: 10 intentos por IP cada 15 minutos
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de login. Intenta en 15 minutos.' },
});
```

Modificar `backend/src/index.ts` — agregar el rate limit global y el de login:

```typescript
// Agregar al inicio de los imports:
import { globalRateLimit, loginRateLimit } from './middleware/rate-limit.middleware';

// Agregar ANTES de app.use('/auth', authRouter):
app.use(globalRateLimit);

// Modificar la línea de authRouter — primero aplicar loginRateLimit solo a /login:
app.use('/auth/login', loginRateLimit);
app.use('/auth', authRouter);
```

---

### 1.2 CORS restrictivo (Opción A)

En Opción A, el frontend vive en el dominio raíz (`hub.tudominio.com`). El backend solo debe
aceptar peticiones desde ese origen. Modificar `backend/src/index.ts`:

```typescript
// Reemplazar:
app.use(cors());

// Con:
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(',');

app.use(cors({
  origin: (origin, callback) => {
    // Permitir peticiones sin origin (curl, Postman, health checks internos)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS: origen no permitido → ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

Agregar a `backend/.env.example`:

```
ALLOWED_ORIGINS=https://hub.tudominio.com,https://tudominio.com
```

---

### 1.3 Helmet con CSP configurado

Reemplazar `app.use(helmet())` en `backend/src/index.ts` con:

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'wss:'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
```

---

### 1.4 Validación de inputs con Zod

Instalar:

```bash
cd backend && npm install zod
```

Crear `backend/src/middleware/validate.middleware.ts`:

```typescript
import type { NextFunction, Request, Response } from 'express';
import { type ZodSchema, ZodError } from 'zod';

export function validate(schema: ZodSchema) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      response.status(422).json({ error: 'Datos inválidos', details: errors });
      return;
    }
    request.body = result.data;
    next();
  };
}
```

Crear `backend/src/schemas/auth.schema.ts`:

```typescript
import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1).max(64).trim(),
  password: z.string().min(1).max(128),
});
```

Crear `backend/src/schemas/project.schema.ts`:

```typescript
import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  slug: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones'),
  url: z.string().url('URL inválida'),
  description: z.string().max(500).optional().default(''),
  icon: z.string().max(10).optional().default('◆'),
  active: z.number().int().min(0).max(1).optional().default(1),
  sort_order: z.number().int().min(0).optional().default(0),
});

export const updateProjectSchema = createProjectSchema.partial();
```

Modificar `backend/src/routes/auth.routes.ts` — agregar validación al login:

```typescript
// Agregar imports:
import { validate } from '../middleware/validate.middleware';
import { loginSchema } from '../schemas/auth.schema';

// Modificar la ruta de login:
authRouter.post('/login', validate(loginSchema), (request, response) => {
  // El body ya está validado y limpio
  const { username, password } = request.body as { username: string; password: string };
  // ... resto igual
});
```

Modificar `backend/src/routes/projects.routes.ts` — agregar validación:

```typescript
// Agregar imports:
import { validate } from '../middleware/validate.middleware';
import { createProjectSchema, updateProjectSchema } from '../schemas/project.schema';

// En POST /: validate(createProjectSchema)
// En PUT /:id o PATCH /:id: validate(updateProjectSchema)
```

---

### 1.5 Audit Log activo

Agregar función en `backend/src/db/database.ts`:

```typescript
export function writeAuditLog(userId: number | null, action: string, ip: string): void {
  db.prepare(
    'INSERT INTO audit_log (user_id, action, ip) VALUES (?, ?, ?)'
  ).run(userId, action, ip);
}
```

Crear `backend/src/middleware/audit.middleware.ts`:

```typescript
import type { NextFunction, Request, Response } from 'express';
import { writeAuditLog } from '../db/database';

// Usar en rutas que modifiquen estado (POST login, DELETE proyecto, etc.)
export function auditAction(action: string) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const userId = request.authUser?.id ?? null;
    const ip = (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? request.socket.remoteAddress
      ?? 'unknown';
    writeAuditLog(userId, action, ip);
    next();
  };
}
```

Aplicar en `auth.routes.ts` después de un login exitoso y en `projects.routes.ts` en operaciones de escritura:

```typescript
// En auth.routes.ts — tras el login exitoso, antes de response.json(result):
writeAuditLog(result.user.id, 'LOGIN', req.ip ?? 'unknown');

// En projects.routes.ts — en POST, PUT, DELETE:
// app.post('/projects', requireAuth, auditAction('PROJECT_CREATE'), handler)
```

---

### 1.6 Rotación del Set de tokens revocados

El `Set<string>` actual en `auth.service.ts` crece indefinidamente. Reemplazar con un Map que
guarda el timestamp de expiración y se limpia periódicamente.

Reemplazar en `backend/src/services/auth.service.ts`:

```typescript
// Reemplazar:
const revokedTokens = new Set<string>();

// Con:
// Map<token, expiresAtMs>
const revokedTokens = new Map<string, number>();

// Limpiar tokens expirados cada 10 minutos
setInterval(() => {
  const now = Date.now();
  for (const [token, expiresAt] of revokedTokens) {
    if (expiresAt < now) revokedTokens.delete(token);
  }
}, 10 * 60 * 1000);

// Modificar logout para guardar expiración:
export function logout(token: string): void {
  // Decodificar sin verificar para obtener exp
  try {
    const decoded = jwt.decode(token) as { exp?: number } | null;
    const expiresAt = decoded?.exp ? decoded.exp * 1000 : Date.now() + 24 * 60 * 60 * 1000;
    revokedTokens.set(token, expiresAt);
  } catch {
    revokedTokens.set(token, Date.now() + 24 * 60 * 60 * 1000);
  }
}

// Modificar verifyToken para usar Map:
export function verifyToken(token: string): AuthUser | null {
  if (revokedTokens.has(token)) return null;
  // ... resto igual
}
```

---

### 1.7 WebSocket: token en header en lugar de query param

El token en query param puede quedar registrado en logs de Nginx. La solución es usar el
primer mensaje del cliente para enviar el token (protocolo de handshake propio).

Modificar `backend/src/ws/metrics.ws.ts`:

```typescript
export function attachMetricsWebSocket(server: Server): void {
  const websocketServer = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url ?? '', true);
    if (pathname !== '/metrics/live') {
      socket.destroy();
      return;
    }
    // Ya no validar token aquí — se valida en el primer mensaje
    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit('connection', websocket, request);
    });
  });

  websocketServer.on('connection', (websocket) => {
    let authenticated = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    // Timeout de autenticación: 5 segundos para enviar token
    const authTimeout = setTimeout(() => {
      if (!authenticated) {
        websocket.close(4001, 'Authentication timeout');
      }
    }, 5000);

    websocket.on('message', (data) => {
      if (!authenticated) {
        try {
          const msg = JSON.parse(data.toString()) as { type?: string; token?: string };
          if (msg.type === 'auth' && msg.token && verifyToken(msg.token)) {
            authenticated = true;
            clearTimeout(authTimeout);
            websocket.send(JSON.stringify({ type: 'auth_ok' }));

            // Iniciar push de métricas
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
        } catch {
          websocket.close(4001, 'Invalid message');
        }
      }
    });

    websocket.on('close', () => {
      clearTimeout(authTimeout);
      if (interval) clearInterval(interval);
    });
  });
}
```

Actualizar `frontend/src/hooks/useMetricsSocket.ts` para enviar el token como primer mensaje:

```typescript
// Donde se crea el WebSocket, reemplazar la conexión con token en URL:

// ANTES (inseguro):
// const ws = new WebSocket(`${wsUrl}/metrics/live?token=${token}`);

// DESPUÉS (seguro):
const ws = new WebSocket(`${wsUrl}/metrics/live`);

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'auth', token }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data as string) as { type: string; server1?: unknown; server2?: unknown };
  if (msg.type === 'auth_ok') {
    // Autenticado, esperar métricas
    return;
  }
  if (msg.type === 'metrics') {
    // Procesar msg.server1 y msg.server2
  }
};
```

---

## SECCIÓN 2 — Frontend: Gaps de implementación

### 2.1 ProtectedRoute component

Verificar si existe `frontend/src/components/ProtectedRoute.tsx`. Si no existe, crearlo:

```typescript
// frontend/src/components/ProtectedRoute.tsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <span>Verificando sesión...</span>
      </div>
    );
  }

  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
```

Verificar `frontend/src/App.tsx` — las rutas deben estar envueltas:

```typescript
// La estructura de rutas debe ser:
<Routes>
  <Route path="/" element={<Home />} />
  <Route path="/login" element={<Login />} />
  {/* Rutas protegidas */}
  <Route element={<ProtectedRoute />}>
    <Route path="/dashboard" element={<Dashboard />} />
  </Route>
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
```

---

### 2.2 Manejo de expiración de token

Modificar `frontend/src/api/client.ts` para interceptar respuestas 401 y limpiar sesión:

```typescript
// Agregar función de fetch con manejo de 401:
type RequestConfig = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export async function apiRequest<T>(
  path: string,
  config: RequestConfig = {}
): Promise<T> {
  const token = getToken(); // Obtener token del contexto/memoria
  
  const response = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
    method: config.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...config.headers,
    },
    body: config.body ? JSON.stringify(config.body) : undefined,
  });

  if (response.status === 401) {
    // Token expirado o inválido — limpiar sesión y redirigir
    clearSession(); // Función del AuthContext
    window.location.href = '/login';
    throw new Error('Sesión expirada');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
    throw new Error((error as { error: string }).error ?? 'Error en la solicitud');
  }

  return response.json() as Promise<T>;
}
```

---

### 2.3 Página Home pública vs. Dashboard privado (Opción A)

La Opción A requiere que `Home.tsx` sea una landing pública (visible sin login) con links a los
proyectos y un botón "Entrar" que lleva a `/login`. El Dashboard es la vista privada de administración.

Verificar que `Home.tsx` **no** usa `useAuth` para proteger la ruta — solo muestra el portal público.
Verificar que `Dashboard.tsx` **sí** está detrás de `ProtectedRoute`.

Si `Home.tsx` tiene lógica de redirección al dashboard cuando hay sesión activa, eso es correcto
y deseable — mantenerlo.

---

### 2.4 Variables de entorno del frontend

Verificar que existe `frontend/.env.example`. Si no existe, crearlo:

```
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
```

Para producción, el agente de despliegue debe crear `frontend/.env.production`:

```
VITE_API_URL=https://hub.tudominio.com/api
VITE_WS_URL=wss://hub.tudominio.com
```

---

## SECCIÓN 3 — Nginx: Headers de seguridad y Rate Limiting

### 3.1 Headers de seguridad en hub.conf

Modificar `nginx/hub.conf` para agregar security headers. Estos deben ir dentro del bloque `server`:

```nginx
# Agregar estos headers en el bloque server (fuera de location):
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
# HSTS — solo activar cuando HTTPS esté confirmado:
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
```

### 3.2 Rate Limiting en Nginx

Agregar al inicio de `nginx/hub.conf` (fuera del bloque server, en el contexto http o en el
archivo principal nginx.conf):

```nginx
# Definir zona de rate limiting (agregar en contexto http del nginx.conf principal)
limit_req_zone $binary_remote_addr zone=hub_general:10m rate=30r/m;
limit_req_zone $binary_remote_addr zone=hub_login:10m rate=5r/m;

# En el bloque server de hub.conf:
# Para rutas de API general:
location /api/ {
    limit_req zone=hub_general burst=10 nodelay;
    proxy_pass http://localhost:3001/;
    # ... headers proxy
}

# Para la ruta de login específicamente:
location /api/auth/login {
    limit_req zone=hub_login burst=3 nodelay;
    proxy_pass http://localhost:3001/auth/login;
    # ... headers proxy
}
```

### 3.3 Revisión de alex.conf y proyectox.conf

Agregar los mismos security headers en `nginx/alex.conf` y `nginx/proyectox.conf`:

```nginx
add_header X-Frame-Options "SAMEORIGIN" always;  # SAMEORIGIN para subdomains propios
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

---

## SECCIÓN 4 — Variables de entorno seguras

### 4.1 .env.example raíz actualizado

El archivo raíz `.env.example` debe contener todos los valores necesarios. Verificar que incluya:

```
# Backend
NODE_ENV=production
PORT=3001
JWT_SECRET=CAMBIAR_POR_SECRETO_SEGURO_DE_64_CHARS_MINIMO
JWT_EXPIRES_IN=8h
ADMIN_USERNAME=CAMBIAR_USUARIO_ADMIN
ADMIN_PASSWORD=CAMBIAR_PASSWORD_MINIMO_16_CHARS
DB_PATH=/data/hub.db
ALLOWED_ORIGINS=https://hub.tudominio.com,https://tudominio.com

# Agent (servidor 2)
AGENT_URL=http://IP_SERVIDOR_2:3002
AGENT_KEY=CAMBIAR_POR_KEY_SEGURA_COMPARTIDA_CON_AGENT
```

### 4.2 Validación de variables obligatorias al arranque

Modificar `backend/src/config/env.ts` para fallar si faltan variables críticas en producción:

```typescript
import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error(`Variable de entorno requerida no definida: ${key}`);
  }
  return value ?? '';
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3001),
  jwtSecret: requireEnv('JWT_SECRET', 'development-secret-insecure'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  agentUrl: process.env.AGENT_URL ?? '',
  agentKey: process.env.AGENT_KEY ?? '',
  dbPath: process.env.DB_PATH ?? './data/hub.db',
  adminUsername: requireEnv('ADMIN_USERNAME', 'admin'),
  adminPassword: requireEnv('ADMIN_PASSWORD', 'admin123'),
  allowedOrigins: process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173',
};
```

---

## SECCIÓN 5 — Documentación (carpeta docs/)

Crear los siguientes archivos en la carpeta `docs/`:

### docs/API.md

Documentar los endpoints del backend con el siguiente formato:

```markdown
# API Reference — Hub Backend

Base URL: `https://hub.tudominio.com/api`

## Autenticación

Todos los endpoints protegidos requieren header:
Authorization: Bearer <token>

### POST /auth/login
Body: { "username": string, "password": string }
Response 200: { "token": string, "user": { "id", "username", "role" } }
Response 401: { "error": "Invalid credentials" }

### POST /auth/logout
Header: Authorization Bearer
Response 204: (sin cuerpo)

### GET /auth/me
Header: Authorization Bearer
Response 200: { "user": { "id", "username", "role" } }

## Proyectos

### GET /projects
Response 200: Project[]

### POST /projects (requiere auth)
Body: CreateProjectSchema
Response 201: Project

### PUT /projects/:id (requiere auth)
Body: UpdateProjectSchema
Response 200: Project

### DELETE /projects/:id (requiere auth)
Response 204

## Métricas

### GET /metrics
Header: Authorization Bearer
Response 200: { server1: MetricsPayload, server2: MetricsPayload }

### WebSocket ws://hub.tudominio.com/metrics/live
Protocolo de handshake:
1. Cliente conecta
2. Cliente envía: { "type": "auth", "token": "<jwt>" }
3. Servidor responde: { "type": "auth_ok" } o cierra con 4001
4. Servidor hace push cada 2s: { "type": "metrics", "server1": {...}, "server2": {...} }
```

### docs/ARCHITECTURE.md

```markdown
# Arquitectura del Sistema Hub

## Servidores

| Servidor | Rol | Servicios |
|---|---|---|
| Servidor 1 (Hub) | Principal | Backend, Frontend, Nginx |
| Servidor 2 (Alex) | Secundario | Agent de métricas |

## Subdominios

| Subdominio | Puerto interno | Descripción |
|---|---|---|
| hub.tudominio.com | 80/443 → 3001 | Portal + API |
| alex.tudominio.com | 80/443 → servicio | Proyecto Alex |
| proyectox.tudominio.com | 80/443 → servicio | Proyecto X |
| db-admin.tudominio.com | 80/443 → servicio | Admin DB |

## Flujo de autenticación (Opción A)

1. Usuario accede a hub.tudominio.com (Home pública)
2. Click en "Entrar" → /login
3. POST /api/auth/login → JWT en memoria del frontend
4. /dashboard (ProtectedRoute verifica JWT en contexto)
5. Dashboard consulta /api/projects y abre WebSocket /metrics/live
6. Al cerrar sesión: POST /api/auth/logout (revoca token en backend)

## Capas de seguridad

1. Nginx: Rate limiting + headers de seguridad + HTTPS/HSTS
2. CORS: Solo orígenes en whitelist
3. Helmet: CSP + frameguard + noSniff
4. Rate limit Express: 100 req/15min global, 10 req/15min login
5. Validación Zod: Todos los inputs del body
6. JWT en memoria: No persiste en localStorage ni cookies
7. Token revocado: Map con expiración automática
8. WebSocket auth: Handshake por mensaje, no por query param
9. Audit log: Todas las acciones de escritura registradas
10. Variables de entorno: Validación de obligatorias en producción
```

---

## SECCIÓN 6 — Orden de implementación para el agente

El agente debe implementar en este orden exacto para evitar conflictos:

```
PASO 1: Instalar dependencias faltantes
  cd backend && npm install express-rate-limit zod
  
PASO 2: Crear archivos nuevos (no modificar existentes aún)
  - backend/src/middleware/rate-limit.middleware.ts
  - backend/src/middleware/validate.middleware.ts
  - backend/src/middleware/audit.middleware.ts
  - backend/src/schemas/auth.schema.ts
  - backend/src/schemas/project.schema.ts
  - frontend/src/components/ProtectedRoute.tsx (si no existe)

PASO 3: Modificar archivos existentes del backend
  - backend/src/config/env.ts → agregar requireEnv y allowedOrigins
  - backend/src/index.ts → CORS restrictivo + Helmet configurado + rate limits
  - backend/src/services/auth.service.ts → Map con expiración en lugar de Set
  - backend/src/db/database.ts → agregar writeAuditLog
  - backend/src/ws/metrics.ws.ts → auth por mensaje en lugar de query param
  - backend/src/routes/auth.routes.ts → validación Zod + audit log
  - backend/src/routes/projects.routes.ts → validación Zod + audit log

PASO 4: Modificar archivos existentes del frontend
  - frontend/src/api/client.ts → interceptor 401 + manejo de expiración
  - frontend/src/hooks/useMetricsSocket.ts → token en mensaje en lugar de query param
  - frontend/src/App.tsx → verificar/agregar ProtectedRoute en rutas

PASO 5: Archivos de configuración
  - .env.example raíz → valores actualizados
  - backend/.env.example → ALLOWED_ORIGINS
  - frontend/.env.example → verificar VITE_API_URL y VITE_WS_URL
  - nginx/hub.conf → security headers + rate limiting
  - nginx/alex.conf → security headers
  - nginx/proyectox.conf → security headers

PASO 6: Documentación
  - docs/API.md
  - docs/ARCHITECTURE.md

PASO 7: Verificación final
  - Compilar backend: cd backend && npm run build (sin errores TypeScript)
  - Compilar frontend: cd frontend && npm run build (sin errores TypeScript)
  - Verificar tipos: npx tsc --noEmit en backend y frontend
```

---

## SECCIÓN 7 — Checklist de seguridad final

Antes de hacer el primer despliegue en Oracle Cloud, verificar:

- [ ] `JWT_SECRET` generado con `openssl rand -hex 32` (mínimo 64 chars)
- [ ] `ADMIN_PASSWORD` cambiado del default `admin123`
- [ ] `ADMIN_USERNAME` cambiado del default `admin`
- [ ] `AGENT_KEY` generado con `openssl rand -hex 32`
- [ ] `ALLOWED_ORIGINS` solo contiene los dominios reales de producción
- [ ] Puertos 3001 y 3002 NO expuestos públicamente (solo Nginx debe llegar a ellos)
- [ ] Puerto 22 (SSH) restringido solo a tu IP en las reglas de Oracle Cloud
- [ ] Certificados SSL obtenidos con Certbot antes de activar HSTS
- [ ] Headers de seguridad verificados en https://securityheaders.com
- [ ] Rate limiting probado: 11 intentos de login deben dar 429
- [ ] WebSocket autentica correctamente y rechaza tokens inválidos

