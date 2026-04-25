# Plan de Desarrollo — Proyecto Hub

## Portal central de administración con autenticación, dashboard de métricas en tiempo real y enrutamiento a proyectos

---

## 1. Visión General

El Hub es el punto de entrada único del dominio principal. Cumple tres funciones:

1. **Portal público** — muestra tarjetas con enlaces a todos los proyectos administrados bajo el dominio.
2. **Autenticación de administrador** — login seguro con JWT para acceder al dashboard privado.
3. **Dashboard de métricas en tiempo real** — visualiza consumo de CPU, RAM, disco y red de los dos servidores, actualizado cada 2 segundos vía WebSocket.

### Tecnologías

| Capa | Tecnología | Justificación |
|---|---|---|
| Backend | Node.js + Express + TypeScript | Mismo stack que el proyecto Alex |
| Frontend | React + Vite + TypeScript + TailwindCSS | Rápido, moderno, compatible con Vite en ARM |
| Base de datos | SQLite (via `better-sqlite3`) | Mínima, sin servidor, solo para usuarios admin |
| Tiempo real | WebSocket (`ws`) | Métricas continuas sin polling desde el cliente |
| Auth | JWT (`jsonwebtoken`) + bcrypt | Sin sesiones en servidor, stateless |
| Contenedores | Docker + Docker Compose | Consistente con el entorno de Alex |
| Proxy | Nginx | Enruta subdominios y termina SSL |

---

## 2. Arquitectura del Sistema

```
tudominio.com              → Hub Frontend  (puerto interno 3000)
api.tudominio.com          → Hub Backend   (puerto interno 3001)
alex.tudominio.com         → Alex Frontend (puerto interno 4000)
proyectox.tudominio.com    → Servidor externo (reverse proxy a IP externa)
db-admin.tudominio.com     → Adminer o API de DB (puerto interno 5050)
```

Nginx recibe todo el tráfico HTTPS y lo enruta internamente. Cada proyecto corre en su propio contenedor Docker. El Hub Backend se comunica con el sistema operativo local leyendo `/proc/` y con el servidor externo a través de un **agente de métricas** (microservicio separado).

---

## 3. Estructura de Directorios

```
hub/
├── backend/
│   ├── src/
│   │   ├── index.ts                        # Entry point, Express + WS server
│   │   ├── config/
│   │   │   └── env.ts                      # Variables de entorno tipadas
│   │   ├── db/
│   │   │   ├── database.ts                 # Conexión SQLite
│   │   │   └── migrations/
│   │   │       └── 001_create_users.sql    # Schema inicial
│   │   ├── routes/
│   │   │   ├── auth.routes.ts              # POST /auth/login, POST /auth/logout
│   │   │   ├── metrics.routes.ts           # GET /metrics/snapshot
│   │   │   └── projects.routes.ts          # GET /projects (lista de proyectos)
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts          # Verifica JWT en headers
│   │   │   └── error.middleware.ts         # Manejo global de errores
│   │   ├── services/
│   │   │   ├── auth.service.ts             # Login, hash, generación JWT
│   │   │   ├── metrics.local.service.ts    # Lee /proc/stat, /proc/meminfo, df
│   │   │   └── metrics.remote.service.ts  # Llama al agente del servidor 2
│   │   ├── ws/
│   │   │   └── metrics.ws.ts               # WebSocket: emite métricas c/2s
│   │   └── types/
│   │       └── index.ts                    # Interfaces TypeScript compartidas
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx                         # Router principal
│   │   ├── pages/
│   │   │   ├── Home.tsx                    # Portal público con tarjetas
│   │   │   ├── Login.tsx                   # Formulario de acceso admin
│   │   │   └── Dashboard.tsx               # Dashboard de métricas (ruta protegida)
│   │   ├── components/
│   │   │   ├── ProjectCard.tsx             # Tarjeta de proyecto con link y estado
│   │   │   ├── MetricGauge.tsx             # Gauge circular (CPU/RAM)
│   │   │   ├── MetricBar.tsx               # Barra de progreso (Disco)
│   │   │   ├── ServerPanel.tsx             # Panel completo de un servidor
│   │   │   └── NavBar.tsx                  # Barra de navegación
│   │   ├── hooks/
│   │   │   ├── useAuth.ts                  # Manejo de JWT en memoria
│   │   │   └── useMetricsSocket.ts         # Conexión y escucha de WebSocket
│   │   ├── context/
│   │   │   └── AuthContext.tsx             # Contexto global de autenticación
│   │   └── api/
│   │       └── client.ts                   # Axios con interceptor de JWT
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── Dockerfile
│
├── agent/                                  # Microservicio para Servidor 2
│   ├── src/
│   │   └── index.ts                        # Express mínimo: GET /metrics
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── nginx/
│   ├── hub.conf
│   ├── alex.conf
│   └── proyectox.conf
│
├── docker-compose.yml
├── docker-compose.prod.yml
└── .env.example
```

---

## 4. Base de Datos (SQLite)

### Schema

```sql
-- migrations/001_create_users.sql

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT    NOT NULL UNIQUE,
  password   TEXT    NOT NULL,          -- bcrypt hash
  role       TEXT    NOT NULL DEFAULT 'admin',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME
);

CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  slug        TEXT    NOT NULL UNIQUE,  -- ej: "alex", "proyectox"
  url         TEXT    NOT NULL,         -- URL completa del subdominio
  description TEXT,
  icon        TEXT,                     -- emoji o nombre de icono
  active      INTEGER DEFAULT 1,
  sort_order  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id),
  action     TEXT    NOT NULL,
  ip         TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Nota de uso
- El archivo SQLite se guarda en `/app/data/hub.db` dentro del contenedor.
- Se monta como volumen Docker para persistencia: `./data:/app/data`.
- No se necesita Postgres ni MySQL; el volumen de datos es mínimo.

---

## 5. API del Backend

### Auth

| Método | Ruta | Body | Descripción |
|---|---|---|---|
| POST | `/auth/login` | `{ username, password }` | Devuelve JWT (24h) |
| POST | `/auth/logout` | — | Invalida sesión (blacklist en memoria) |
| GET | `/auth/me` | — (JWT) | Devuelve datos del usuario autenticado |

### Métricas

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/metrics/snapshot` | JWT | Snapshot puntual de ambos servidores |
| WS | `ws://api.tudominio.com/metrics/live` | JWT en query param | Stream continuo cada 2s |

**Formato de respuesta de métricas:**
```json
{
  "server1": {
    "cpu": { "usage": 23.4, "cores": 2 },
    "ram": { "used": 4096, "total": 20480, "percent": 20.0 },
    "disk": { "used": 12000, "total": 50000, "percent": 24.0 },
    "network": { "rx_bytes": 1024000, "tx_bytes": 512000 },
    "uptime": 864000
  },
  "server2": { ... }
}
```

### Proyectos

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/projects` | No | Lista proyectos activos (para el portal público) |
| POST | `/projects` | JWT | Crea nuevo proyecto |
| PUT | `/projects/:id` | JWT | Edita proyecto |
| DELETE | `/projects/:id` | JWT | Desactiva proyecto |

---

## 6. Frontend — Páginas y Flujo

### `/` — Home (público)

- Grid de tarjetas con cada proyecto registrado.
- Cada tarjeta muestra: nombre, descripción, icono, URL (abre en nueva pestaña).
- Botón discreto "Admin" en la esquina superior derecha.

### `/login` — Login Admin

- Formulario simple: username + password.
- Al autenticar, guarda JWT en memoria (variable de módulo, no localStorage).
- Redirige a `/dashboard`.

### `/dashboard` — Dashboard Admin (protegido)

- **Panel Servidor 1** y **Panel Servidor 2** en layout side-by-side.
- Cada panel muestra en tiempo real:
  - CPU % por núcleo (gauge animado)
  - RAM usada / total (barra de progreso)
  - Disco usado % (barra de progreso)
  - Red: rx/tx en KB/s
  - Uptime formateado (días, horas, minutos)
- Alertas visuales si CPU > 80% o RAM > 85%.
- Lista de proyectos con estado activo/inactivo y acceso rápido.

---

## 7. Agente de Métricas (Servidor 2)

Microservicio Node.js mínimo que debe desplegarse en el **segundo servidor**. Expone un único endpoint protegido con API key (header `X-Agent-Key`):

```
GET /metrics   →  devuelve JSON con CPU, RAM, disco, red, uptime
```

El Hub Backend llama a este endpoint cada 2 segundos y reenvía los datos por WebSocket al frontend. El agente se despliega también con Docker y escucha en el puerto `9100` (solo accesible internamente o vía firewall restringido).

---

## 8. Docker Compose

```yaml
# docker-compose.yml

version: "3.9"

services:
  hub-backend:
    build: ./backend
    container_name: hub-backend
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
      - AGENT_URL=${AGENT_URL}
      - AGENT_KEY=${AGENT_KEY}
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

networks:
  hub-net:
    driver: bridge
```

---

## 9. Variables de Entorno

### Backend `.env.example`

```env
NODE_ENV=production
PORT=3001

# JWT
JWT_SECRET=cambia_esto_por_un_secreto_largo_y_aleatorio
JWT_EXPIRES_IN=24h

# Agente Servidor 2
AGENT_URL=http://IP_SERVIDOR_2:9100
AGENT_KEY=clave_secreta_del_agente

# SQLite
DB_PATH=/app/data/hub.db

# Admin inicial (se crea al arrancar si no existe)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=cambia_esto_al_primer_login
```

### Frontend `.env.example`

```env
VITE_API_URL=https://api.tudominio.com
VITE_WS_URL=wss://api.tudominio.com
```

---

## 10. Configuración Nginx

### `hub.conf`
```nginx
server {
    listen 80;
    server_name tudominio.com www.tudominio.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name api.tudominio.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### `alex.conf`
```nginx
server {
    listen 80;
    server_name alex.tudominio.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 11. Pasos de Despliegue en el Servidor Oracle

```bash
# 1. Clonar el repositorio
git clone https://github.com/johnmesa-cell/hub.git /srv/hub
cd /srv/hub

# 2. Copiar y editar variables de entorno
cp .env.example .env
nano .env   # <- poner los valores reales

# 3. Construir y levantar contenedores
docker compose up -d --build

# 4. Copiar configs de Nginx
sudo cp nginx/*.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/hub.conf /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/alex.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 5. Obtener certificados SSL
sudo certbot --nginx \
  -d tudominio.com \
  -d www.tudominio.com \
  -d api.tudominio.com \
  -d alex.tudominio.com

# 6. Abrir puertos en Oracle Cloud
# En Security List: permitir ingress TCP 80 y 443 desde 0.0.0.0/0
# En el sistema:
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

---

## 12. Orden de Desarrollo Recomendado

1. **Backend — DB y Auth** (`db/`, `routes/auth.routes.ts`, `services/auth.service.ts`)
2. **Backend — Métricas locales** (`services/metrics.local.service.ts`)
3. **Backend — WebSocket** (`ws/metrics.ws.ts`)
4. **Agente servidor 2** (`agent/`)
5. **Backend — Métricas remotas** (`services/metrics.remote.service.ts`)
6. **Backend — Rutas de proyectos** (`routes/projects.routes.ts`)
7. **Frontend — Home y ProjectCard** (`pages/Home.tsx`)
8. **Frontend — Login y AuthContext** (`pages/Login.tsx`, `context/AuthContext.tsx`)
9. **Frontend — Dashboard y WebSocket hook** (`pages/Dashboard.tsx`, `hooks/useMetricsSocket.ts`)
10. **Docker Compose + Nginx + despliegue**

---

## 13. Consideraciones de Seguridad

- El JWT nunca se guarda en `localStorage` (vulnerable a XSS); se mantiene en memoria de la aplicación React.
- El endpoint del agente en el servidor 2 solo acepta peticiones con el header `X-Agent-Key` correcto; idealmente el puerto `9100` está cerrado al público y solo es accesible desde la IP del servidor principal.
- Las contraseñas se almacenan como hashes `bcrypt` con salt factor 12.
- Nginx debe estar configurado con HTTPS (Certbot) antes de producción; nunca enviar JWT por HTTP plano.
- El archivo `.env` nunca debe commitearse al repositorio (está en `.gitignore`).

