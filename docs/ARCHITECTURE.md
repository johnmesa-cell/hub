# Arquitectura del Sistema Hub

## Servidores

| Servidor | Rol | Servicios |
|---|---|---|
| Servidor 1 (Hub) | Principal | Backend, Frontend, Nginx |
| Servidor 2 (Alex) | Secundario | Agent de métricas |

## Subdominios

| Subdominio | Puerto interno | Descripción |
|---|---|---|
| hub.tudominio.com | 80/443 -> 3001 | Portal + API |
| alex.tudominio.com | 80/443 -> servicio | Proyecto Alex |
| proyectox.tudominio.com | 80/443 -> servicio | Proyecto X |
| db-admin.tudominio.com | 80/443 -> servicio | Admin DB |

## Flujo de autenticación con Firebase

1. Usuario accede a hub.tudominio.com (Home pública)
2. Click en "Continuar con Google" -> /login
3. Firebase Auth (popup Google OAuth) -> ID token en cliente
4. Frontend guarda en firebaseAuth.currentUser (memoria)
5. /dashboard (ProtectedRoute verifica user !== null)
6. Dashboard consulta /api/projects (ID token automático en Authorization header)
7. Dashboard abre WebSocket /metrics/live (ID token en handshake)
8. Renovación de token cada 50 minutos con user.getIdToken(true)
9. Al cerrar sesión: Firebase signOut() limpia currentUser

## Flujo de autorización en Backend

1. Cliente envía Authorization: Bearer <id-token>
2. Middleware async requireAuth() verifica token con Firebase Admin SDK
3. admin.auth().verifyIdToken(idToken) retorna decoded token o null
4. Request.firebaseUser = { uid, email, name }
5. Rutas protegidas pueden acceder a request.firebaseUser
6. audit_log registra firebase_uid en lugar de user_id numérico

## Capas de seguridad

1. Nginx: Rate limiting + headers de seguridad + HTTPS/HSTS
2. CORS: Solo orígenes en whitelist
3. Helmet: CSP + frameguard + noSniff (incluye apis.google.com y firebaseapp.com)
4. Rate limit Express: 100 req/15min global
5. Validación Zod: Todos los inputs del body
6. Firebase Auth: OAuth 2.0 + token ID verificado criptográficamente
7. ID Token en memoria: No persiste en localStorage (solo en sesión Firebase)
8. WebSocket auth: Handshake por mensaje con token renovable
9. Audit log: Todas las acciones de escritura registradas con firebase_uid
10. Variables de entorno: FIREBASE_PROJECT_ID validada en producción
11. GOOGLE_APPLICATION_CREDENTIALS: Para Firebase Admin SDK (credenciales de servicio)
