> **Histórico:** este documento describe una implementación anterior y no representa la arquitectura actual del proyecto.

# Migración SQLite → Firestore — Hub (Backend + Frontend)
> Documento generado el 26 de abril de 2026

---

## Resumen de cambios

### Backend
| Archivo | Acción |
|---|---|
| `backend/src/db/database.ts` | Eliminar |
| `backend/src/db/migrations/001_create_tables.sql` | Eliminar |
| `backend/src/firestore/projects.firestore.ts` | Crear (nuevo) |
| `backend/src/firestore/audit.firestore.ts` | Crear (nuevo) |
| `backend/src/middleware/audit.middleware.ts` | Reescribir |
| `backend/src/routes/projects.routes.ts` | Reescribir |
| `backend/src/types/index.ts` | `id: string`, `active: boolean` |
| `backend/src/config/env.ts` | Eliminar `dbPath` |
| `backend/package.json` | Eliminar `better-sqlite3` |
| `docker-compose.yml` | Eliminar volumen `data` y `DB_PATH` |
| `.env` servidor | Eliminar `DB_PATH` |

### Frontend
| Archivo | Acción |
|---|---|
| `frontend/src/types.ts` | `id: string`, `active: boolean` |

---

## Paso 1 — Firestore: crear colección manualmente

En https://console.firebase.google.com → proyecto `hub-pagina-admin`
→ Firestore Database → crear colección `projects` con estos documentos
(el ID de cada documento será el `slug`):

```
Colección: projects

  Documento ID: hub
    name: "Hub"
    slug: "hub"
    url: "https://tudominio.com"
    description: "Portal central de administración"
    icon: "◆"
    active: true
    sort_order: 0

  Documento ID: alex
    name: "Alex"
    slug: "alex"
    url: "https://alex.tudominio.com"
    description: "Proyecto principal de Alex"
    icon: "◈"
    active: true
    sort_order: 1
```

> Agrega los demás proyectos con la misma estructura.

---

## Paso 2 — Eliminar archivos SQLite

```bash
rm backend/src/db/database.ts
rm backend/src/db/migrations/001_create_tables.sql
rmdir backend/src/db/migrations
rmdir backend/src/db
```

---

## Paso 3 — Crear `backend/src/firestore/projects.firestore.ts`

```bash
mkdir -p backend/src/firestore
```

```typescript
// backend/src/firestore/projects.firestore.ts
import { getFirestore } from 'firebase-admin/firestore';
import type { Project } from '../types';

const COLLECTION = 'projects';

function docToProject(id: string, data: FirebaseFirestore.DocumentData): Project {
  return {
    id,
    name: data.name,
    slug: data.slug,
    url: data.url,
    description: data.description ?? null,
    icon: data.icon ?? null,
    active: data.active === true,
    sort_order: data.sort_order ?? 0,
  };
}

export async function listProjects(includeInactive = false): Promise<Project[]> {
  const db = getFirestore();
  let query: FirebaseFirestore.Query = db.collection(COLLECTION).orderBy('sort_order', 'asc');
  if (!includeInactive) {
    query = query.where('active', '==', true);
  }
  const snapshot = await query.get();
  return snapshot.docs.map((doc) => docToProject(doc.id, doc.data()));
}

export async function getProjectByDocId(docId: string): Promise<Project | null> {
  const db = getFirestore();
  const doc = await db.collection(COLLECTION).doc(docId).get();
  if (!doc.exists) return null;
  return docToProject(doc.id, doc.data()!);
}

export async function createProject(data: Omit<Project, 'id'>): Promise<Project> {
  const db = getFirestore();
  const docRef = db.collection(COLLECTION).doc(data.slug);
  await docRef.set({
    name: data.name,
    slug: data.slug,
    url: data.url,
    description: data.description ?? null,
    icon: data.icon ?? null,
    active: data.active,
    sort_order: data.sort_order,
  });
  return docToProject(docRef.id, await docRef.get().then((d) => d.data()!));
}

export async function updateProject(
  docId: string,
  data: Partial<Omit<Project, 'id'>>
): Promise<Project | null> {
  const db = getFirestore();
  const docRef = db.collection(COLLECTION).doc(docId);
  const existing = await docRef.get();
  if (!existing.exists) return null;
  await docRef.update(data as FirebaseFirestore.UpdateData<Project>);
  return docToProject(docId, (await docRef.get()).data()!);
}

export async function deactivateProject(docId: string): Promise<boolean> {
  const db = getFirestore();
  const docRef = db.collection(COLLECTION).doc(docId);
  const existing = await docRef.get();
  if (!existing.exists) return false;
  await docRef.update({ active: false });
  return true;
}
```

---

## Paso 4 — Crear `backend/src/firestore/audit.firestore.ts`

```typescript
// backend/src/firestore/audit.firestore.ts
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export async function writeAuditLog(
  firebaseUid: string | null,
  action: string,
  ip: string
): Promise<void> {
  const db = getFirestore();
  await db.collection('audit_log').add({
    firebase_uid: firebaseUid,
    action,
    ip,
    created_at: FieldValue.serverTimestamp(),
  });
}
```

---

## Paso 5 — Reescribir `backend/src/middleware/audit.middleware.ts`

```typescript
// backend/src/middleware/audit.middleware.ts
import type { NextFunction, Request, Response } from 'express';
import { writeAuditLog } from '../firestore/audit.firestore';

export function auditAction(action: string) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const firebaseUid = request.firebaseUser?.uid ?? null;
    const forwardedFor = request.headers['x-forwarded-for'];
    const ip =
      typeof forwardedFor === 'string'
        ? forwardedFor.split(',')[0].trim()
        : request.socket.remoteAddress ?? 'unknown';

    // Fire-and-forget: no bloquea la respuesta
    writeAuditLog(firebaseUid, action, ip).catch((err) =>
      console.error('[audit] Error escribiendo log:', err)
    );
    next();
  };
}
```

---

## Paso 6 — Reescribir `backend/src/routes/projects.routes.ts`

```typescript
// backend/src/routes/projects.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { auditAction } from '../middleware/audit.middleware';
import { validate } from '../middleware/validate.middleware';
import { createProjectSchema, updateProjectSchema } from '../schemas/project.schema';
import {
  listProjects,
  createProject,
  updateProject,
  deactivateProject,
} from '../firestore/projects.firestore';

export const projectsRouter = Router();

// GET /projects — público
projectsRouter.get('/', async (_request, response, next) => {
  try {
    const projects = await listProjects();
    response.json({ projects });
  } catch (err) {
    next(err);
  }
});

// POST /projects — requiere auth
projectsRouter.post(
  '/',
  requireAuth,
  auditAction('PROJECT_CREATE'),
  validate(createProjectSchema),
  async (request, response, next) => {
    try {
      const project = await createProject(request.body);
      response.status(201).json({ project });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /projects/:id — requiere auth (id = slug del documento Firestore)
projectsRouter.put(
  '/:id',
  requireAuth,
  auditAction('PROJECT_UPDATE'),
  validate(updateProjectSchema),
  async (request, response, next) => {
    try {
      const updated = await updateProject(request.params.id, request.body);
      if (!updated) {
        response.status(404).json({ error: 'Project not found' });
        return;
      }
      response.json({ project: updated });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /projects/:id — requiere auth (id = slug del documento Firestore)
projectsRouter.delete(
  '/:id',
  requireAuth,
  auditAction('PROJECT_DELETE'),
  async (request, response, next) => {
    try {
      const deleted = await deactivateProject(request.params.id);
      if (!deleted) {
        response.status(404).json({ error: 'Project not found' });
        return;
      }
      response.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);
```

---

## Paso 7 — Actualizar `backend/src/types/index.ts`

```typescript
// backend/src/types/index.ts
export interface Project {
  id: string;        // era number, ahora es el slug (doc ID de Firestore)
  name: string;
  slug: string;
  url: string;
  description: string | null;
  icon: string | null;
  active: boolean;   // era number (0/1), ahora boolean
  sort_order: number;
}

export interface MetricCpu {
  usage: number;
  cores: number;
}

export interface MetricRam {
  used: number;
  total: number;
  percent: number;
}

export interface MetricDisk {
  used: number;
  total: number;
  percent: number;
}

export interface MetricNetwork {
  rx_bytes: number;
  tx_bytes: number;
}

export interface ServerMetrics {
  cpu: MetricCpu;
  ram: MetricRam;
  disk: MetricDisk;
  network: MetricNetwork;
  uptime: number;
}

export interface MetricsSnapshot {
  server1: ServerMetrics;
  server2: ServerMetrics;
}
```

---

## Paso 8 — Actualizar `backend/src/config/env.ts`

```typescript
// backend/src/config/env.ts
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
  // dbPath eliminado — ya no se usa SQLite
  allowedOrigins: process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173',
};
```

---

## Paso 9 — Eliminar `better-sqlite3` del proyecto

```bash
cd backend
npm uninstall better-sqlite3
npm uninstall --save-dev @types/better-sqlite3
```

---

## Paso 10 — Actualizar `frontend/src/types.ts`

Solo cambian dos líneas: `id` de `number` a `string`, y `active` de `number` a `boolean`.
El resto del frontend (Home.tsx, Dashboard.tsx, ProjectCard.tsx) no requiere ningún cambio
porque la lógica condicional de `active` ya era compatible con boolean.

```typescript
// frontend/src/types.ts
export interface Project {
  id: string;        // era number, ahora es el slug (doc ID de Firestore)
  name: string;
  slug: string;
  url: string;
  description: string | null;
  icon: string | null;
  active: boolean;   // era number (0/1), ahora boolean
  sort_order: number;
}

export interface MetricCpu {
  usage: number;
  cores: number;
}

export interface MetricRam {
  used: number;
  total: number;
  percent: number;
}

export interface MetricDisk {
  used: number;
  total: number;
  percent: number;
}

export interface MetricNetwork {
  rx_bytes: number;
  tx_bytes: number;
}

export interface ServerMetrics {
  cpu: MetricCpu;
  ram: MetricRam;
  disk: MetricDisk;
  network: MetricNetwork;
  uptime: number;
}

export interface MetricsSnapshot {
  server1: ServerMetrics;
  server2: ServerMetrics;
}
```

---

## Paso 11 — Actualizar `docker-compose.yml`

Eliminar el volumen `./data:/app/data` y la variable `DB_PATH`:

```yaml
services:
  hub-backend:
    build: ./backend
    container_name: hub-backend
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      # ./data:/app/data  ← ELIMINADO (ya no hay SQLite)
      - ./backend/serviceAccountKey.json:/run/secrets/serviceAccountKey.json:ro
    environment:
      NODE_ENV: production
      FIREBASE_PROJECT_ID: ${FIREBASE_PROJECT_ID}
      GOOGLE_APPLICATION_CREDENTIALS: /run/secrets/serviceAccountKey.json
      AGENT_URL: ${AGENT_URL}
      AGENT_KEY: ${AGENT_KEY}
      ALLOWED_ORIGINS: ${ALLOWED_ORIGINS}
      # DB_PATH: ${DB_PATH}  ← ELIMINADO
    depends_on:
      - hub-agent
    networks:
      - hub-net

  hub-frontend:
    build: ./frontend
    container_name: hub-frontend
    restart: unless-stopped
    ports:
      - "3000:80"
    depends_on:
      - hub-backend
    networks:
      - hub-net

  hub-agent:
    build: ./agent
    container_name: hub-agent
    restart: unless-stopped
    environment:
      PORT: 9100
      AGENT_KEY: ${AGENT_KEY}
    networks:
      - hub-net

networks:
  hub-net:
    driver: bridge
```

---

## Paso 12 — `.env` final del servidor

```env
# ─────────────────────────────────────────
# HUB — Environment Variables (Servidor)
# ─────────────────────────────────────────

# Entorno
NODE_ENV=production
PORT=3001

# Firebase Admin SDK
FIREBASE_PROJECT_ID=hub-pagina-admin
GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/serviceAccountKey.json

# Orígenes permitidos para CORS (separados por coma, sin espacios)
# En producción cambiar por el dominio real con HTTPS
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Agente interno (se comunica por red Docker, no por localhost)
AGENT_URL=http://hub-agent:9100
# Generar con: openssl rand -hex 32
AGENT_KEY=REEMPLAZAR_CON_openssl_rand_-hex_32
```

---

## Paso 13 — `.env` local (desarrollo)

```env
# ─────────────────────────────────────────
# HUB — Environment Variables (Local)
# ─────────────────────────────────────────

NODE_ENV=development
PORT=3001

FIREBASE_PROJECT_ID=hub-pagina-admin
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json

ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

AGENT_URL=http://localhost:3002
AGENT_KEY=development-key-compartida
```

---

## Paso 14 — Build y deploy en el servidor

```bash
cd /opt/hub

# Reconstruir backend y frontend
sudo docker compose build hub-backend hub-frontend

# Levantar todo
sudo docker compose up -d

# Verificar que no crashea
sudo docker logs hub-backend --tail 30 -f
```

---

## Paso 15 — Verificación final

```bash
# El backend debe responder con ok: true
curl http://localhost:3001/healthz

# Los proyectos deben venir de Firestore
curl http://localhost:3001/projects
```

Respuesta esperada de `/projects`:
```json
{
  "projects": [
    {
      "id": "hub",
      "name": "Hub",
      "slug": "hub",
      "url": "https://tudominio.com",
      "description": "Portal central de administración",
      "icon": "◆",
      "active": true,
      "sort_order": 0
    }
  ]
}
```
