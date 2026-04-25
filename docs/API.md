# API Reference - Hub Backend

Base URL: `https://hub.tudominio.com/api`

## Autenticación

Todos los endpoints protegidos requieren header:
Authorization: Bearer <firebase-id-token>

Los tokens de ID de Firebase se obtienen automáticamente desde el cliente web usando Firebase Auth + Google OAuth.

### GET /auth/me
Verifica que el token de Firebase es válido y devuelve datos del usuario autenticado.

Header: Authorization Bearer
Response 200: { "user": { "uid": string, "email": string | undefined, "name": string | undefined } }
Response 401: { "error": "Unauthorized" }

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
2. Cliente envía: { "type": "auth", "token": "<firebase-id-token>" }
3. Servidor verifica token con Firebase Admin SDK
4. Servidor responde: { "type": "auth_ok", "uid": "<firebase-uid>" } o cierra con 4001
5. Servidor hace push cada 2s: { "type": "metrics", "server1": {...}, "server2": {...} }
6. Cliente renueva token cada 50 minutos con getIdToken(true)
