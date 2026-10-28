# Hub

Hub es el portal de entrada de `hub.<dominio>`. Muestra tarjetas que enlazan a subdominios: las tarjetas públicas se muestran sin sesión y las privadas solo a los usuarios autenticados permitidos.

## Arquitectura

- `backend/`: Express + Firebase Admin. Verifica tokens de Firebase, aplica autorización por correo y gestiona `projects` en Firestore.
- `frontend/`: React + Vite + Firebase Auth. Home pública y dashboard protegido.
- Firestore: persistencia de proyectos y auditoría. `firestore.rules` bloquea el acceso directo del navegador.
- Nginx: termina HTTPS y hace proxy a `127.0.0.1:3000` y `127.0.0.1:3001`.

## Variables de entorno

`FIREBASE_PROJECT_ID`, `ALLOWED_ORIGINS`, `ALLOWED_EMAILS`, `VITE_API_URL`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` y `VITE_FIREBASE_APP_ID`. Firebase Admin usa `GOOGLE_APPLICATION_CREDENTIALS` o las credenciales del entorno de ejecución.

`ALLOWED_EMAILS` es una lista separada por comas. Vacía permite cualquier token válido; en producción debe contener únicamente las dos cuentas autorizadas.

## Arranque

```powershell
cp .env.example .env
docker compose up -d --build
```

En Windows puede usarse `Copy-Item .env.example .env`. Configure también las variables frontend de Firebase antes de compilar la imagen.

## Firestore

La colección `projects` contiene: `name` (string), `slug` (string), `url` (string), `description` (string), `icon` (string), `sort_order` (number), `active` (boolean) y `visibility` (`public` o `private`).

Despliegue las reglas con `firebase deploy --only firestore:rules`. Las reglas niegan todo acceso cliente; solo el backend usa Admin SDK.

## Añadir un subdominio

1. Apunte el DNS del subdominio al VPS.
2. Cree una tarjeta desde `/dashboard` con URL, slug, orden, estado y visibilidad.
3. Si el servicio necesita proxy del VPS, añada un bloque Nginx propio y su certificado Certbot.

Las rutas reales están documentadas en [docs/API.md](docs/API.md); la API no usa el prefijo `/api`.
