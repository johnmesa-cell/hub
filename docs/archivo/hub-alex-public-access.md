> **Histórico:** este documento describe una implementación anterior y no representa la arquitectura actual del proyecto.

# Hub — Hacer público el acceso al proyecto de Alex

> **Instrucciones para GitHub Copilot Agent**
> Ejecutar en VS Code (modo SSH) sobre el workspace `/opt/hub`.
> Objetivo: permitir que el proyecto de Alex sea accesible desde la página pública de Hub **sin requerir inicio de sesión**, conservando la protección de autenticación en el dashboard y rutas privadas.

---

## Contexto del cambio

El proyecto de Alex ya tiene su propio sistema de autenticación interno. No es necesario que esté protegido por el login de Hub. La landing page pública debe mostrar su tarjeta y permitir abrir su URL directamente.

---

## Archivos a modificar

### 1. `backend/src/routes/projects.routes.ts`

**Objetivo:** El endpoint `GET /api/projects` debe ser accesible sin token para usuarios no autenticados. Solo las rutas de escritura (POST, PUT, DELETE) conservan `authMiddleware`.

**Cambio esperado:**

```ts
// ANTES — authMiddleware aplicado a toda la ruta o al GET
router.get('/', authMiddleware, projectsController.getAll);

// DESPUÉS — GET público, escrituras protegidas
router.get('/', projectsController.getAll);
router.post('/', authMiddleware, auditMiddleware, projectsController.create);
router.put('/:id', authMiddleware, auditMiddleware, projectsController.update);
router.delete('/:id', authMiddleware, auditMiddleware, projectsController.delete);
```

> Si el archivo ya tiene este esquema parcialmente, ajustar solo las líneas necesarias sin tocar las rutas protegidas.

---

### 2. `backend/src/middleware/auth.middleware.ts`

**Objetivo:** Verificar que el middleware de auth **no bloquee** con un 401 si la ruta es pública. No debe modificarse la lógica existente del middleware; solo confirmar que no está aplicado globalmente en `index.ts` a todas las rutas.

**Verificar en `backend/src/index.ts`:**

```ts
// INCORRECTO — aplica auth a todo
app.use(authMiddleware);

// CORRECTO — auth solo por ruta específica
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectsRoutes);   // GET dentro ya es público
app.use('/api/metrics', authMiddleware, metricsRoutes); // métricas siempre privadas
```

---

### 3. `frontend/src/App.tsx`

**Objetivo:** La ruta `/` (Home) debe ser una ruta pública. Solo `/dashboard` y otras rutas privadas deben estar envueltas en `<ProtectedRoute>`.

**Cambio esperado:**

```tsx
// ANTES — si Home estaba protegida
<Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />

// DESPUÉS — Home pública
<Route path="/" element={<Home />} />
<Route path="/login" element={<Login />} />
<Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
```

---

### 4. `frontend/src/pages/Home.tsx`

**Objetivo:** La página principal debe cargar y mostrar los proyectos públicos sin depender del estado de autenticación. Usar el cliente API directamente; no condicionar el fetch al usuario logueado.

**Cambio esperado:**

```tsx
// ANTES — fetch condicionado al usuario autenticado
useEffect(() => {
  if (!user) return;
  fetchProjects();
}, [user]);

// DESPUÉS — fetch siempre al montar
useEffect(() => {
  fetchProjects();
}, []);
```

> El botón o enlace al dashboard privado sí puede mostrar/ocultar condicionalmente según `user`.

---

### 5. `frontend/src/components/ProjectCard.tsx`

**Objetivo:** La tarjeta del proyecto debe renderizar su URL como enlace directo (`<a href>`) que abre en nueva pestaña, **sin ninguna validación de sesión previa**. No debe envolverse en ningún guard de autenticación.

**Verificar que el enlace sea:**

```tsx
<a
  href={project.url}
  target="_blank"
  rel="noopener noreferrer"
  aria-label={`Abrir ${project.name}`}
>
  {project.name}
</a>
```

> Si actualmente el enlace hace `navigate('/login')` cuando no hay sesión, eliminar esa lógica del `ProjectCard`.

---

### 6. `frontend/src/hooks/useAuth.ts` *(solo verificar — probablemente sin cambios)*

**Objetivo:** Confirmar que el hook no bloquea el render global de la app cuando el usuario no está autenticado. Debe retornar `user: null` sin redirigir ni lanzar errores en rutas públicas.

---

## Verificación post-cambio

Después de aplicar los cambios, ejecutar:

```bash
# Reconstruir y levantar contenedores
cd /opt/hub
sudo docker compose build hub-backend hub-frontend
sudo docker compose up -d

# Verificar que la API de proyectos responde sin token
curl -s https://megiddo20.me/api/projects | head -c 500

# Verificar que el healthcheck sigue verde
curl -s https://megiddo20.me/api/healthz
```

**Resultado esperado:**
- `GET /api/projects` → responde `200` con la lista de proyectos sin `Authorization` header.
- La landing `https://megiddo20.me` muestra las tarjetas de proyectos sin redirigir al login.
- El proyecto de Alex abre su URL directamente al hacer clic.
- `https://megiddo20.me/dashboard` sigue redirigiendo al login si no hay sesión activa.

---

## Criterio de aceptación

| Escenario | Resultado esperado |
|---|---|
| Usuario NO autenticado visita `/` | Ve todos los proyectos públicos |
| Usuario NO autenticado hace clic en Alex | Abre la URL del proyecto directamente |
| Usuario NO autenticado visita `/dashboard` | Redirigido a `/login` |
| Usuario autenticado visita `/` | Ve los proyectos + acceso al dashboard |
| `GET /api/projects` sin token | HTTP 200 con JSON de proyectos |
| `POST /api/projects` sin token | HTTP 401 (mantiene protección) |

---

## Notas para Copilot

- No modificar la lógica de autenticación de Firebase en `firebase.ts` ni en `auth.service.ts`.
- No alterar el flujo de `auditMiddleware` en las rutas de escritura.
- Conservar el campo `active: boolean` en Firestore; si se desea filtrar solo proyectos activos en el GET público, es aceptable pero no obligatorio.
- Si existe algún campo `public: boolean` en el tipo `Project`, usarlo para filtrar en el frontend. Si no existe, no es necesario agregarlo para este cambio.
