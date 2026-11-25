# SinFiltro · Backend

Node.js 24+, TypeScript, Express 5 y PostgreSQL con `pg`. Arquitectura hexagonal: `domain` define entidades/puertos, `application` contiene casos de uso e `infrastructure` implementa HTTP y persistencia.

## Ejecutar

Desde `backend`, ejecutar `npm ci`. Si falta `.env`, copiar `.env.example` y completar:

```env
DATABASE_URL=postgresql://usuario:password@localhost:5432/sin_filtro
PORT=3000
NODE_ENV=development
ATTENDANCE_PIN_SECRET=<64 caracteres hexadecimales aleatorios>
```

Generar el secreto una vez con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` y guardarlo solo en `.env`. No compartirlo ni cambiarlo en cada arranque; si se cambia, regenerar los PIN vigentes.

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

Una cuenta `user` autenticada publica su propia actividad con `POST /activities`. El organizador se obtiene de la sesión y el estado se fija en `published`; el cuerpo no acepta `organizerId` ni `status`. La ubicación se envía internamente como latitud/longitud elegidas desde el mapa del mobile. El cupo cuenta participantes y no incluye al organizador.

Las rutas protegidas requieren `Authorization: Bearer <token>`.

| Ruta | Acceso / datos |
| --- | --- |
| `POST /auth/register` | Público: `{email, password}` → sesión, rol `user` y perfil pendiente. |
| `POST /auth/login` | Público: `{email, password}` → sesión y rol real de la cuenta. |
| `GET /activities/map?lat=-12.04&lng=-77.03&radiusMeters=5000` | Sesión activa: actividades publicadas, no eliminadas y no finalizadas, dentro del radio. |
| `GET /activities/mine` | Usuario: actividades que organiza y actividades ajenas en las que continúa inscrito, hasta 100 por grupo. |
| `GET /activities/:id` | Usuario: detalle, organizador, cupo, estado, participantes y relación del usuario actual. |
| `GET /activities/:id/participants` | Usuario: participantes inscritos; el organizador se devuelve por separado en el detalle. |
| `POST /activities/:id/join` | Usuario: se une si está publicada y tiene cupo. El organizador no puede inscribirse. |
| `DELETE /activities/:id/join` | Usuario: retira su propia inscripción. |
| `PATCH /activities/:id` | Organizador: edita su actividad sin cambiar organizador ni estado. |
| `POST /activities/:id/cancel` | Organizador: cancela una actividad no finalizada. |
| `GET /activities/:id/attendance` | Inscrito: ventana, asistencia propia y contadores. El organizador recibe además la lista de confirmados/pendientes. Nunca devuelve el PIN. |
| `POST /activities/:id/attendance/pin` | Organizador: genera o regenera el PIN; devuelve `{pin, expiresAt}` una sola vez, sin caché. |
| `DELETE /activities/:id/attendance/pin` | Organizador: revoca el PIN. No borra asistencias confirmadas. |
| `POST /activities/:id/attendance/validate` | Inscrito: `{pin: "001234"}` → `{validatedAt}`. La identidad sale de la sesión. |
| `GET /activities/:id/chat/messages?beforeId=&limit=30` | Miembro `joined`: historial paginado, información temporal y no leídos. |
| `POST /activities/:id/chat/messages` | Miembro `joined`: envía `{body}` mientras la actividad está publicada. |
| `POST /activities/:id/chat/read` | Miembro `joined`: marca hasta `{messageId}` como leído. |
| `GET /categories` | Público: `{categories: [{id, name, slug}]}`; solo intereses activos. |
| `GET /auth/me` | Sesión: `{user}` con rol/perfil actuales. |
| `PATCH /auth/profile` | Usuario: `{displayName, bio, interestIds}` → `{user}`. Modifica solo su perfil. |
| `POST /auth/logout` | Sesión: revoca token, responde `204`. |
| `POST/GET /users`, `GET/PATCH/DELETE /users/:id` | Solo administrador, en todos los entornos. Gestiona exclusivamente cuentas con rol `user`; PATCH modifica correo/contraseña. |
| `POST/GET /events`, `GET/PATCH/DELETE /events/:id` | Solo administrador. CRUD de eventos de usuarios, almacenados en `activities`. |

El administrador gestiona datos; no organiza ni participa en eventos con sus credenciales administrativas. El CRUD no incluye crear/modificar administradores. Los usuarios normales publican, editan y cancelan sus propias actividades, y pueden unirse o retirarse de actividades ajenas. Ver [ejemplos para Thunder Client](docs/admin-api.md).

## Asistencia con PIN (bloque 4)

Implementada sobre `activity_checkin_codes` y `activity_participants` del esquema existente: no volver a ejecutar el esquema sobre una BD ya creada. Abre 15 minutos antes del inicio y cierra al finalizar por hora/estado o cancelar. Cada PIN dura como máximo 15 minutos, sin superar el fin. Se genera con aleatoriedad criptográfica y se guarda solo HMAC-SHA-256 vinculado al evento y a su generación.

Cinco fallos por usuario/evento bloquean 15 minutos en PostgreSQL; regenerar el PIN no reinicia intentos. Hay límite adicional por IP (60 operaciones/15 minutos) y 30 segundos entre emisiones por evento. La validación es idempotente y se serializa con edición/cancelación mediante bloqueo de la actividad. El organizador puede confirmar explícitamente su asistencia ingresando el PIN vigente; no ocupa cupo ni incrementa los contadores. El chat no consulta el PIN. El detalle devuelve los permisos del futuro álbum; la galería y subida de fotos están disponibles en el módulo de recuerdos.

Prueba aislada: `RUN_POSTGRES_TESTS=1 node --env-file=.env --test test/integration/attendance-postgres.test.ts` crea y elimina una BD temporal; requiere permiso de creación de bases.

Las respuestas administrativas de usuarios al crear, consultar y editar incluyen `id`, `email`, `role`, `status`, `profile` y `createdAt`; el listado usa `{users: [...]}` y las demás `{user: {...}}`. Nunca se devuelve la contraseña ni su hash. `profile` contiene `displayName`, `bio`, `interestIds` y `completed`.

`PATCH /users/:id` acepta exclusivamente `email` y/o `password`: no cambia rol, estado ni perfil. Las contraseñas, tanto al iniciar sesión como al registrarse o crearse/cambiarse administrativamente, deben tener 8–64 caracteres. Para personalizar el perfil, el usuario usa `PATCH /auth/profile` con `displayName`, `bio` (puede ser `""`) e `interestIds`; enviar los IDs reales de `GET /categories`. El perfil del administrador no se edita desde esa ruta por ahora.

IDs BIGINT como texto. Contraseñas con scrypt. Sesiones de 30 minutos en memoria; reiniciar el backend las elimina. Login y registro tienen cada uno límite de 10 peticiones por IP/15 minutos. Cada petición protegida consulta el estado/rol actual; cuentas suspendidas/eliminadas no acceden. Cambiar contraseña o eliminar usuario revoca sesiones. El despliegue actual requiere un único proceso.

## Chat temporal

`ws://HOST:PORT/ws` (o `wss://` en HTTPS) notifica mensajes nuevos. El cliente autentica enviando primero `{type:"authenticate",token}` y después `{type:"subscribe",activityId}`; el token no viaja en la URL. Enviar mensajes continúa usando REST para aplicar transacciones, permisos y límite de 30 mensajes por minuto.

Organizador y participantes `joined` acceden sin PIN. Al retirarse pierden acceso. Al finalizar o cancelar, el chat queda en lectura durante 24 horas y luego se oculta. Los mensajes se eliminan físicamente siete días después del cierre mediante una tarea que corre al iniciar y cada seis horas. Los avatares usan la inicial del nombre hasta implementar almacenamiento de fotos.

## Verificación y alcance

`npm run typecheck`, `npm test`, `npm run build`. `npm start` ejecuta la compilación de `dist`; los CRUD están protegidos por rol también en producción. `npm test` usa memoria/dobles y omite la integración real. `npm run test:integration` verifica los endpoints con PostgreSQL/PostGIS: crea y elimina una base temporal propia en el servidor de `DATABASE_URL` (requiere permiso CREATEDB y PostGIS disponible); no modifica los datos del proyecto.

El [modelo social de 13 tablas](docs/database/README.md) ya soporta el CRUD administrativo, publicación, detalle, edición, cancelación e inscripción de usuarios en actividades. PIN y chat están implementados; la galería de fotos está implementada. `docs/database/schema.sql` es un esquema completo para una base nueva, no se ejecuta sobre tablas existentes. También quedan pendientes recuperación de contraseña, fotos de perfil y sesiones persistentes.

Solo se versiona `.env.example`; `.env` y variantes locales están ignorados.

## Lectura de actividades para el mapa

`GET /activities/map` requiere Bearer de una cuenta activa (un usuario normal puede consultarlo). `lat` y `lng` son obligatorios; `radiusMeters` vale 5000 por defecto y admite hasta 10000. Responde `{activities: [...], hasMore: boolean}`, hasta 100 resultados ordenados por distancia e ID. Incluye coordenadas, título, descripción, lugar, categoría, fechas, zona, precio, moneda y distancia; no expone correos ni datos administrativos.

Usa `ST_DWithin` sobre el índice espacial existente. `phase=active` (predeterminado) incluye próximas y en curso; `phase=finished` incluye finalizadas por estado u hora con álbum público o asistencia validada, no revocada ni expulsada. Excluye borradores, canceladas, actividades eliminadas y álbumes eliminados. Devuelve `phase`: `upcoming`, `ongoing` o `finished`. La consulta no persiste la ubicación ni inscribe al usuario. El CRUD `/events` continúa reservado a administradores.

## Privacidad y activación de álbumes

Antes de arrancar esta versión sobre una base existente, ejecutar una vez [album-privacy.sql](docs/database/album-privacy.sql) en Query Tool. En una base vacía usar solo `schema.sql`. La migración conserva la privacidad de álbumes existentes y usa `private` para las demás actividades.

`albumVisibility`: `public` o `private` en creación (predeterminado `private`). Se puede cambiar en borrador; desde la publicación queda inmutable tanto para organizador como administrador, con protección adicional en PostgreSQL.

`GET /activities/:id` devuelve `album: { enabled, canView, canUpload }`. El álbum se materializa al consultar el detalle finalizado, mediante inserción idempotente. Cancelar no activa álbum. Solo asistencia validada permite subir; en privados también se exige para ver. La foto actual es ilustrativa, no una foto privada. El módulo de recuerdos aplica estos permisos al listado, galería, subida y lectura de archivos. El cliente nunca autoriza por sí solo una operación.

## Recuerdos y fotos

Implementado: “Mis recuerdos”, búsqueda por radio, galería paginada, subida de fotos y edición/eliminación propias. Archivos privados en `./storage/photos` (opcional `PHOTO_STORAGE_DIR`); nunca se exponen como carpeta estática ni se suben a Git. PostgreSQL guarda referencia, autor, descripción, bytes y dimensiones. Respaldar **base y carpeta** juntos. En un despliegue se necesita disco persistente compartido o sustituir el adaptador por almacenamiento de objetos.

Esta entrega ya aplicó `docs/database/album-photos.sql` a la base local. **No necesitas ejecutarlo de nuevo.** En otra base existente se puede ejecutar; es reejecutable. Una base nueva usa solo `schema.sql`. [Rutas, reglas y archivos modificados](docs/memories.md).

`GET /profiles/:id` requiere sesión y devuelve solo nombre, biografía e intereses de usuarios activos. No expone correo, contraseña ni datos de sesión.

## Despliegue

Preparación y configuración del servicio: [Backend en Render](docs/render.md). `npm run start:production` ejecuta `dist/main.js` con variables del alojamiento, sin requerir `.env`.
