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
- **Administrador:** entra a una pantalla vacía. Para asignarlo a una cuenta activa existente, ejecutar desde `backend`:

```sh
npm run set-admin -- correo@ejemplo.com
```

Después volver a iniciar sesión. No hay administradores precargados. El rol de la app es independiente del usuario PostgreSQL de `DATABASE_URL`.

## API

Las rutas protegidas requieren `Authorization: Bearer <token>`.

| Ruta | Acceso / datos |
| --- | --- |
| `POST /auth/register` | Público: `{email, password}` → sesión, rol `user` y perfil pendiente. |
| `POST /auth/login` | Público: `{email, password}` → sesión y rol real de la cuenta. |
| `GET /categories` | Público: `{categories: [{id, name, slug}]}`; solo intereses activos. |
| `GET /auth/me` | Sesión: `{user}` con rol/perfil actuales. |
| `PATCH /auth/profile` | Usuario: `{displayName, bio, interestIds}` → `{user}`. Modifica solo su perfil. |
| `POST /auth/logout` | Sesión: revoca token, responde `204`. |
| `POST/GET /users`, `GET/PATCH/DELETE /users/:id` | Solo administrador y `NODE_ENV=development`; en producción responden `404`. PATCH modifica correo/contraseña. |

Las respuestas administrativas de crear, consultar y editar incluyen `id`, `email`, `role`, `status`, `profile` y `createdAt`; el listado usa `{users: [...]}` y las demás `{user: {...}}`. Nunca se devuelve la contraseña ni su hash. `profile` contiene `displayName`, `bio`, `interestIds` y `completed`.

`PATCH /users/:id` acepta exclusivamente `email` y/o `password`: no cambia rol, estado ni perfil. Las contraseñas, tanto al iniciar sesión como al registrarse o crearse/cambiarse administrativamente, deben tener 8–64 caracteres. Para personalizar el perfil, el usuario usa `PATCH /auth/profile` con `displayName`, `bio` (puede ser `""`) e `interestIds`; enviar los IDs reales de `GET /categories`. El perfil del administrador no se edita desde esa ruta por ahora.

IDs BIGINT como texto. Contraseñas con scrypt. Sesiones de 30 minutos en memoria; reiniciar el backend las elimina. Login y registro tienen cada uno límite de 10 peticiones por IP/15 minutos. Cada petición protegida consulta el estado/rol actual; cuentas suspendidas/eliminadas no acceden. Cambiar contraseña o eliminar usuario revoca sesiones. El despliegue actual requiere un único proceso.

## Verificación y alcance

`npm run typecheck`, `npm test`, `npm run build`. `npm start` ejecuta la compilación de `dist`; `NODE_ENV=production npm start` deshabilita el CRUD de desarrollo. Las pruebas automatizadas usan repositorios en memoria/dobles y no modifican la base real.

El [modelo social de 13 tablas](docs/database/README.md) conserva eventos, PIN, chat y álbumes como funciones pendientes; registro y perfil ya usan sus tres tablas correspondientes. `docs/database/schema.sql` es un esquema completo para una base nueva, no se ejecuta sobre tablas existentes. También quedan pendientes recuperación de contraseña, fotos de perfil y sesiones persistentes.

Solo se versiona `.env.example`; `.env` y variantes locales están ignorados.
