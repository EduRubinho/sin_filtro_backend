# SinFiltro · Backend

Node.js 24+, TypeScript, Express 5 y PostgreSQL. Arquitectura hexagonal y SQL parametrizado con `pg`, sin ORM. Implementa autenticación y CRUD de usuarios para desarrollo.

## Ejecutar

Desde la raíz del proyecto:

```sh
cd backend
npm ci
```

Si no existe `.env`, copiar `cp .env.example .env` y completar:

```env
DATABASE_URL=postgresql://usuario:password@localhost:5432/sin_filtro
PORT=3000
NODE_ENV=development
```

- `DATABASE_URL`: conexión a PostgreSQL; `5432` es el puerto de la base.
- `PORT`: puerto de la API; si se omite, usa `3000`.
- `NODE_ENV=development`: habilita el CRUD público `/users`. También es el valor usado si se omite. En `production` esas rutas responden `404`.

Crear la base `sin_filtro` en PostgreSQL si no existe. Ejecutar [sql/001_create_users.sql](sql/001_create_users.sql) desde pgAdmin **solo si aún no existe `public.users`**. El backend no ejecuta ese SQL automáticamente.

Iniciar con `npm run dev`. Verifica conexión/esquema y escucha en `0.0.0.0:3000` por defecto.

## Cuenta local

Con el backend iniciado en desarrollo:

```sh
curl -i http://localhost:3000/users \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.com","password":"Ejemplo-local-123!"}'
```

Crea una cuenta para el login móvil. No hay usuarios precargados. La contraseña se almacena como hash scrypt; el correo no requiere dominio universitario.

## Endpoints actuales

| Método y ruta | Función |
| --- | --- |
| `POST /auth/login` | Recibe `email/password`; devuelve `token`, `expiresAt` y `user`. |
| `GET /auth/me` | Devuelve el usuario; requiere `Authorization: Bearer <token>`. |
| `POST /auth/logout` | Revoca el token; requiere la misma cabecera. |
| `POST /users` | Crea usuario con `email/password`; solo desarrollo. |
| `GET /users` y `GET /users/:id` | Lista o consulta usuarios; solo desarrollo. |
| `PATCH /users/:id` | Modifica correo y/o contraseña; solo desarrollo. |
| `DELETE /users/:id` | Elimina usuario; solo desarrollo. |

Las rutas `/users` no exigen autenticación en desarrollo. IDs BIGINT se devuelven como texto. Errores: `{ "error": { "code": "...", "message": "..." } }`.

Sesiones de 30 minutos en memoria: reiniciar el backend las elimina. Login admite 10 peticiones por IP cada 15 minutos. Cambiar contraseña o eliminar usuario revoca sus sesiones. El despliegue actual requiere un único proceso.

## Estructura y propuesta de datos

`src/user/domain`: entidades e interfaces; `application`: casos de uso; `infrastructure`: HTTP y repositorios. `src/shared/infrastructure` contiene configuración, pool y `ServiceContainer`; `src/main.ts` inicia el servidor.

El esquema actual usa `public.users`. La [propuesta de 13 tablas](docs/database/README.md) documenta eventos con ubicación propia, chat, asistencia por PIN compartido, álbumes y consultas por radio. **Esos endpoints todavía no están implementados.** Su [schema.sql](docs/database/schema.sql) es para una base nueva, no una migración sobre la existente.

## Comandos y Git

Desde `backend`: `npm run typecheck`, `npm test` y `npm run build` verifican tipos, pruebas y compilación. `npm start` ejecuta `dist/main.js` después de compilar; para deshabilitar el CRUD público, usar `NODE_ENV=production npm start`.

Las pruebas usan dobles de PostgreSQL; no modifican la base real ni validan PostGIS. El registro público de producción y la recuperación de contraseña están pendientes.

Solo se versiona `.env.example`, con valores de referencia. `.env` y sus variantes locales están ignorados; las credenciales reales permanecen en cada entorno.
