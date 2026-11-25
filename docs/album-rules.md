# Entrega: filtros y reglas del álbum

Activas incluye próximas/en curso; finalizadas usa privacidad pública o asistencia validada, no revocada ni expulsada. Canceladas y eliminadas se excluyen. Inscribirse antes/durante no valida asistencia. La privacidad se fija al publicar, incluso para administración.

Al abrir un detalle finalizado se crea el álbum vacío de forma idempotente y se devuelven `enabled`, `canView`, `canUpload`. La confirmación del organizador usa el mismo PIN y ventana, sin ocupar cupo. Es una declaración propia de presencia.

La foto actual es ilustrativa. La entrega posterior documentada en `memories.md` implementa galería, almacenamiento privado local y endpoints de fotos; no se deben usar los permisos del cliente como autorización de futuras operaciones.

## Base existente

Aplicar una sola vez `database/album-privacy.sql`. Conserva visibilidad de álbumes existentes; actividades sin álbum quedan privadas. Para una base vacía, usar únicamente `database/schema.sql`. La migración se aplicó a la base local durante esta entrega, sin eliminar datos.

## Archivos de esta entrega

15 archivos de backend (incluido este documento):

- `src/event/domain/Event.ts`, `MapActivity.ts`: privacidad y filtro.
- `src/event/application/EventManagement.ts`: identidad del lector del mapa.
- `src/event/infrastructure/ExpressEventRouter.ts`: sesión y caché privada.
- `src/event/infrastructure/PostgresEventRepository.ts`: filtros, permisos, activación y límite de inscripción.
- `src/event/infrastructure/PostgresAttendanceRepository.ts`: confirmación del organizador.
- `docs/database/schema.sql`, `album-privacy.sql`: columna y restricciones SQL.
- `README.md`, `docs/database/README.md`, `docs/album-rules.md`: documentación.
- `test/event/event.test.ts`, `map.test.ts`: validaciones.
- `test/integration/attendance-postgres.test.ts`, `admin-postgres.test.ts`: permisos y flujos reales. Se corrigieron dos supuestos antiguos del test administrativo: ya existía una actividad y el organizador no consume cupo.

14 archivos de mobile:

- `src/types/event.ts`, `activity.ts`: contratos.
- `src/utils/eventForm.ts`: privacidad en formulario.
- `src/services/activities.ts`, `admin.ts`: solicitudes y validación de respuestas.
- `src/hooks/useMapActivities.ts`: filtro conservando resultados y aislamiento por sesión.
- `src/components/activities/MapScreen.tsx`: filtros y marcador blanco/negro.
- `src/components/activities/PublishActivityScreen.tsx`, `src/components/admin/EventForm.tsx`: elegir/bloquear privacidad.
- `src/components/activities/ActivityDetailScreen.tsx`: reglas y estado del álbum.
- `src/components/activities/AttendancePanel.tsx`: confirmación propia del organizador.
- `README.md`, `test/activities.test.ts`, `test/admin.test.ts`: documentación y contratos.

Los cambios anteriores del bloque de asistencia ya estaban en el workspace y se conservaron. No se cambió el SDK ni se añadieron dependencias.
