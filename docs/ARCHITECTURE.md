# Arquitectura del Hub

## Componentes

| Componente | Responsabilidad |
|---|---|
| Nginx del VPS | HTTPS, rate limiting y proxy |
| Frontend | Home pública, Firebase Auth y dashboard protegido |
| Backend | Express, validación, autorización y API |
| Firestore | `projects` y `audit_log` |
| Firebase Auth | Google OAuth para cuentas permitidas |

## Subdominios

| Subdominio | Puerto interno | Descripción |
|---|---|---|
| hub.tudominio.com | 80/443 -> 3001 | Portal + API |
| alex.tudominio.com | 80/443 -> servicio | Proyecto Alex |
| proyectox.tudominio.com | 80/443 -> servicio | Proyecto X |
| db-admin.tudominio.com | 80/443 -> servicio | Admin DB |

Compose solo ejecuta `hub-backend` y `hub-frontend`, con puertos publicados en loopback.

## Flujo público y privado

1. Home espera a que Firebase restaure la sesión.
2. Sin sesión, `GET /projects` devuelve solo `active=true` y `visibility=public`.
3. Con token válido y correo permitido devuelve todos los activos.
4. Dashboard usa `GET /projects?all=true` para incluir inactivos.
5. POST, PUT y DELETE requieren autenticación, validación y auditoría.

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
8. Firestore Rules: todo acceso cliente denegado
9. Variables de entorno: `FIREBASE_PROJECT_ID` y `ALLOWED_EMAILS`

Los valores desconocidos de `visibility` se tratan como privados y `active` se almacena como booleano.
