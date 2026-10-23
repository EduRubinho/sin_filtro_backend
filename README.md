# SinFiltro · Backend

Node.js 24+, TypeScript, Express 5 y PostgreSQL con `pg`. Arquitectura hexagonal: `domain` define entidades/puertos, `application` contiene casos de uso e `infrastructure` implementa HTTP y persistencia.

## Ejecutar

Desde `backend`, ejecutar `npm ci`. Si falta `.env`, copiar `.env.example` y completar:

```env
DATABASE_URL=postgresql://usuario:password@localhost:5432/sin_filtro
PORT=3000
NODE_ENV=development
```

La base indicada debe existir. `5432` es el puerto de PostgreSQL y `PORT` es el de la API.

```sh
npm run dev
```

Preparación inicial: en pgAdmin selecciona tu base nueva y vacía, abre Query Tool y ejecuta completo [docs/database/schema.sql](docs/database/schema.sql) **una sola vez**, antes de iniciar el backend. Requiere PostGIS instalado en el servidor. Este es el único esquema: crea las 13 tablas, `users` con todos sus atributos y cuatro intereses iniciales. No crea cuentas ni importa usuarios de otra base. Si ya ejecutaste este esquema completo en esa base, no lo repitas. El backend no ejecuta SQL de instalación al arrancar.

## Cuentas y roles

Crear cuenta desde mobile: correo válido de cualquier dominio y contraseña de 8–64 caracteres. Siempre crea `role=user`; la API no acepta elegir rol. El mismo login devuelve `user.role` y `user.profile`.

- **Usuario:** completa nombre (1–80 caracteres), biografía opcional (hasta 500) y al menos dos intereses activos; después entra al mapa. Puede editar su perfil.
- **Administrador:** entra al panel móvil de gestión de usuarios y eventos. Para asignarlo a una cuenta activa existente, ejecutar desde `backend`:

```sh
npm run set-admin -- correo@ejemplo.com
```

Después volver a iniciar sesión. No hay administradores precargados. El rol de la app es independiente del usuario PostgreSQL de `DATABASE_URL`.

## API

Una cuenta `user` autenticada publica su propia actividad con `POST /activities`. El organizador se obtiene de la sesión y el estado se fija en `published`; el cuerpo no acepta `organizerId` ni `status`. La ubicación se envía internamente como latitud/longitud elegidas desde el mapa del mobile.

Las rutas protegidas requieren `Authorization: Bearer <token>`.

| Ruta | Acceso / datos |
| --- | --- |
| `POST /auth/register` | Público: `{email, password}` → sesión, rol `user` y perfil pendiente. |
| `POST /auth/login` | Público: `{email, password}` → sesión y rol real de la cuenta. |
| `GET /activities/map?lat=-12.04&lng=-77.03&radiusMeters=5000` | Sesión activa: actividades publicadas, no eliminadas y no finalizadas, dentro del radio. |
| `GET /categories` | Público: `{categories: [{id, name, slug}]}`; solo intereses activos. |
| `GET /auth/me` | Sesión: `{user}` con rol/perfil actuales. |
| `PATCH /auth/profile` | Usuario: `{displayName, bio, interestIds}` → `{user}`. Modifica solo su perfil. |
| `POST /auth/logout` | Sesión: revoca token, responde `204`. |
| `POST/GET /users`, `GET/PATCH/DELETE /users/:id` | Solo administrador, en todos los entornos. Gestiona exclusivamente cuentas con rol `user`; PATCH modifica correo/contraseña. |
| `POST/GET /events`, `GET/PATCH/DELETE /events/:id` | Solo administrador. CRUD de eventos de usuarios, almacenados en `activities`. |

El administrador gestiona datos; no organiza ni participa en eventos con sus credenciales administrativas. El CRUD no incluye crear/modificar administradores. Los endpoints de creación e inscripción desde la app para usuarios normales siguen pendientes. Ver [ejemplos para Thunder Client](docs/admin-api.md).

Las respuestas administrativas de usuarios al crear, consultar y editar incluyen `id`, `email`, `role`, `status`, `profile` y `createdAt`; el listado usa `{users: [...]}` y las demás `{user: {...}}`. Nunca se devuelve la contraseña ni su hash. `profile` contiene `displayName`, `bio`, `interestIds` y `completed`.

`PATCH /users/:id` acepta exclusivamente `email` y/o `password`: no cambia rol, estado ni perfil. Las contraseñas, tanto al iniciar sesión como al registrarse o crearse/cambiarse administrativamente, deben tener 8–64 caracteres. Para personalizar el perfil, el usuario usa `PATCH /auth/profile` con `displayName`, `bio` (puede ser `""`) e `interestIds`; enviar los IDs reales de `GET /categories`. El perfil del administrador no se edita desde esa ruta por ahora.

IDs BIGINT como texto. Contraseñas con scrypt. Sesiones de 30 minutos en memoria; reiniciar el backend las elimina. Login y registro tienen cada uno límite de 10 peticiones por IP/15 minutos. Cada petición protegida consulta el estado/rol actual; cuentas suspendidas/eliminadas no acceden. Cambiar contraseña o eliminar usuario revoca sesiones. El despliegue actual requiere un único proceso.

## Verificación y alcance

`npm run typecheck`, `npm test`, `npm run build`. `npm start` ejecuta la compilación de `dist`; los CRUD están protegidos por rol también en producción. `npm test` usa memoria/dobles y omite la integración real. `npm run test:integration` verifica los endpoints con PostgreSQL/PostGIS: crea y elimina una base temporal propia en el servidor de `DATABASE_URL` (requiere permiso CREATEDB y PostGIS disponible); no modifica los datos del proyecto.

El [modelo social de 13 tablas](docs/database/README.md) ya soporta el CRUD administrativo de eventos y usuarios. PIN, chat, álbumes y el flujo de creación/inscripción por usuarios desde la app siguen pendientes. `docs/database/schema.sql` es un esquema completo para una base nueva, no se ejecuta sobre tablas existentes. También quedan pendientes recuperación de contraseña, fotos de perfil y sesiones persistentes.

Solo se versiona `.env.example`; `.env` y variantes locales están ignorados.

## Lectura de actividades para el mapa

`GET /activities/map` requiere Bearer de una cuenta activa (un usuario normal puede consultarlo). `lat` y `lng` son obligatorios; `radiusMeters` vale 5000 por defecto y admite hasta 10000. Responde `{activities: [...], hasMore: boolean}`, hasta 100 resultados ordenados por distancia e ID. Incluye coordenadas, título, descripción, lugar, categoría, fechas, zona, precio, moneda y distancia; no expone correos ni datos administrativos.

Usa `ST_DWithin` sobre el índice espacial existente. Incluye futuros y en curso (`published` y `ends_at > ahora`); excluye borradores, cancelados, completados, eliminados y terminados por hora. La consulta no persiste la ubicación ni inscribe al usuario. El CRUD `/events` continúa reservado a administradores.
