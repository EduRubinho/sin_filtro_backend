# CRUD administrativo · Thunder Client

La publicación normal de usuarios usa `POST /activities` y queda fuera del CRUD administrativo. El servidor asigna como organizador al usuario autenticado. El panel administrativo conserva `POST /events`, pero su formulario selecciona las coordenadas mediante un mapa.

Iniciar el backend con `npm run dev`. Base URL: `http://localhost:3000` (ajustar si cambiaste PORT).

El administrador gestiona datos de usuarios normales y sus eventos. Su cuenta no se convierte en organizador ni participante. Estos endpoints requieren administrador tanto en desarrollo como en producción; los usuarios normales reciben `403`. No implementan todavía el flujo de crear/unirse a eventos desde la app.

## Autenticación

`POST /auth/login`, Body JSON:

```json
{"email":"admin@ejemplo.com","password":"TuClave123!"}
```

Usar una cuenta existente con rol `admin` (asignación local: `npm run set-admin -- admin@ejemplo.com`). Copiar `token` de la respuesta y agregar a todas las peticiones siguientes:

```text
Authorization: Bearer TOKEN_RECIBIDO
Content-Type: application/json
```

El token vence a los 30 minutos; reiniciar el backend invalida las sesiones.

## Usuarios

| Acción | Petición | Body / respuesta |
| --- | --- | --- |
| Crear | `POST /users` | `{"email":"persona@ejemplo.com","password":"TuClave123!"}` → `201 {user}` |
| Listar | `GET /users?limit=50&offset=0` | `200 {users: [...]}` |
| Consultar | `GET /users/2` | `200 {user}` |
| Editar | `PATCH /users/2` | `{"email":"otro@ejemplo.com"}` y/o `password` → `200 {user}` |
| Eliminar | `DELETE /users/2` | `204`, sin Body de respuesta |

Solo cuentas con `role=user`. Los administradores no aparecen en el listado y su ID responde `404` al consultar, editar o eliminar. No se aceptan cambios de rol/estado/perfil en este CRUD. Las respuestas incluyen `id`, `email`, `role`, `status`, `profile` y `createdAt`; nunca hashes. El cambio de contraseña revoca las sesiones del usuario.

Eliminar es definitivo para cuentas sin relaciones que lo impidan. Si un usuario organiza/participa en eventos u otros registros con FK restrictiva, responde `409 CONFLICT` y no lo elimina. No borra eventos en cascada para forzar la eliminación de la cuenta.

## Eventos

La API los llama `events`; PostgreSQL mantiene el nombre `activities`. No hay tablas nuevas ni migraciones.

| Acción | Petición | Respuesta |
| --- | --- | --- |
| Crear | `POST /events` | `201 {event}` + header Location |
| Listar | `GET /events?limit=50&offset=0` | `200 {events: [...]}`, más recientes primero |
| Consultar | `GET /events/1` | `200 {event}` |
| Editar | `PATCH /events/1` | `200 {event}` |
| Eliminar | `DELETE /events/1` | `204`, sin Body de respuesta |

Ejemplo de creación administrativa de un evento perteneciente a un usuario normal. Reemplazar IDs por los de `GET /users` y `GET /categories`; usar fechas futuras:

```json
{
  "organizerId": "2",
  "categoryId": "1",
  "title": "Vóley en el parque",
  "description": "Trae agua. Todos los niveles.",
  "locationName": "Parque Central, cancha 2",
  "latitude": -12.0464,
  "longitude": -77.0428,
  "startsAt": "2027-01-15T17:00:00-05:00",
  "endsAt": "2027-01-15T19:00:00-05:00",
  "capacity": 12,
  "status": "published"
}
```

Obligatorios: `organizerId`, `categoryId`, `title`, `locationName`, `latitude`, `longitude`, `startsAt`, `endsAt`. Opcionales: `description` (vacío), `address` y `meetingDetails` (null), `timeZone` (`America/Lima`), `price` (0), `currency` (`PEN`), `capacity` (null = sin límite), `status` (`draft`). IDs como texto; fechas ISO con zona horaria; coordenadas y precio como números.

El organizador debe tener rol `user` y estado `active`. Se crea su inscripción en la misma transacción para cumplir las relaciones de la BD; no se valida asistencia por PIN ni se inscribe al administrador. La categoría debe estar activa.

PATCH recibe únicamente los campos a cambiar, por ejemplo:

```json
{"title":"Vóley del viernes","capacity":16,"price":0}
```

- No permite cambiar `organizerId`, IDs, fechas de auditoría ni `deletedAt`.
- Inicio futuro al crear; fin posterior al inicio. Precio no negativo con hasta dos decimales. Cupo positivo, incluyendo al organizador, nunca menor que los inscritos.
- Nuevo evento: `draft` o `published`. Un publicado no vuelve a borrador; `completed` requiere un evento publicado que ya comenzó. `cancelled` y `completed` no se reabren.
- Lugar/horario no cambian después del inicio o cierre. La fecha de finalización explícita la asigna el servidor.
- DELETE establece `deleted_at`: conserva relaciones e historial y deja de aparecer en listado/detalle. Consultar, editar o eliminar nuevamente responde `404`.

Paginación de ambos listados: `limit` 1–100 y `offset` entero no negativo. Sin filtros adicionales por ahora.

Errores: `400` datos inválidos, `401` sesión ausente/vencida, `403` cuenta sin permiso, `404` recurso no gestionable/inexistente, `409` conflicto de estado, cupo, correo o relaciones. Formato: `{"error":{"code":"...","message":"..."}}`.
