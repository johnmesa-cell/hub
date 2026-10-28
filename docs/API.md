# API del Hub

Base URL: `https://api.tudominio.com`

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
Sin token devuelve únicamente proyectos `active=true` y `visibility=public`. Con un token Firebase válido y correo permitido devuelve todos los activos. `?all=true` autenticado incluye también inactivos; sin sesión se ignora.

Response 200: `{ "projects": Project[] }`

### POST /projects (requiere auth)
Body: CreateProjectSchema
Response 201: `{ "project": Project }`

### PUT /projects/:id (requiere auth)
Body: UpdateProjectSchema
Response 200: `{ "project": Project }`

### DELETE /projects/:id (requiere auth)
Response 204

### GET /healthz
Endpoint público de salud. Responde `{ "ok": true }`.
