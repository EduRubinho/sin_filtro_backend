# Recuerdos y fotos

Implementado en esta entrega. Sin servicios externos ni credenciales nuevas: los archivos viven en `backend/storage/photos`, excluida de Git. `PHOTO_STORAGE_DIR` permite elegir otra carpeta persistente. El adaptador `PhotoStorage` permite migrar a almacenamiento de objetos sin cambiar las reglas del módulo.

## Flujo y permisos

- Mis recuerdos: actividades finalizadas con asistencia validada, no revocada ni expulsada; incluye organizador confirmado.
- Cercanos: GPS o punto elegido, radio hasta 10 km; público o privado con asistencia. El móvil ofrece 500 m, 1 km y 5 km.
- Público significa visible para cualquier cuenta **user autenticada**, no una URL web anónima. Administradores no usan este módulo social.
- Galería: 30 fotos por página, cursor por ID. Lista de álbumes: 20 por página.
- Subir exige evento finalizado y asistencia válida. Se revalida dentro de la transacción al guardar; crear el evento no basta.
- Selección de hasta cinco fotos o cámara; vista previa, descripción, progreso y reintento. Clave estable por subida evita duplicados si se pierde la respuesta.
- Solo el autor edita descripción (máximo 500 caracteres) o elimina. Puede eliminar aunque posteriormente pierda acceso, mediante su endpoint autenticado. No hay edición de píxeles ni moderación administrativa en esta entrega.
- Borrado: se oculta en PostgreSQL y se elimina el archivo; repetir DELETE permite reintentar una eliminación de disco que falle.
- No hay vencimiento automático de álbumes: todavía no se ha definido una política de conservación.

## Archivos y seguridad

Subida binaria JPEG de hasta 8 MiB. El móvil convierte y comprime; el servidor valida el contenido real, rechaza imágenes inválidas/animadas o de más de 40 MP y vuelve a generar JPEG de hasta 1600 px sin EXIF/GPS. Se conserva el tamaño real en bytes. Límites de subida por IP: 20/minuto. Los originales no se guardan.

Los endpoints de contenido vuelven a comprobar permisos, usan Bearer, `private, no-store` y no exponen `storage_key`. No hay carpeta pública ni enlaces permanentes que omitan la sesión. La foto ilustrativa de la actividad es independiente de las fotos del álbum.

Para desplegar, la carpeta debe estar en un volumen persistente; no usar el disco efímero de un contenedor. Respaldar DB y archivos juntos. Una caída del proceso entre escribir el archivo y confirmar la transacción puede dejar un archivo huérfano: antes de automatizar limpieza, comparar referencias con archivos y respetar subidas en curso. No hay limpieza automática de huérfanos en esta versión.

## API

Todas las rutas requieren sesión user activa.

| Método/ruta | Función |
| --- | --- |
| `GET /albums?mode=mine&offset=0` | Mis recuerdos |
| `GET /albums?mode=nearby&lat=-18&lng=-70&radiusMeters=500&offset=0` | Cercanos |
| `GET /activities/:id/album?before=ID` | Álbum y página de fotos; before es opcional |
| `POST /activities/:id/album/photos` | Cuerpo JPEG; cabeceras Content-Type: image/jpeg y X-Upload-ID estable de 16–80 caracteres alfanuméricos/guiones |
| `GET /photos/:id/content` | Imagen autorizada |
| `PATCH /photos/:id` | `{ "caption": "Descripción" }`, solo autor |
| `DELETE /photos/:id` | Borrado propio; reintento idempotente |

## Base local

`database/album-photos.sql` ya se aplicó durante esta entrega; no requiere ejecución manual. Es reejecutable y añade size_bytes, width, height, upload_id e índice único por autor/subida. No borra datos. El esquema inicial también está actualizado para instalaciones nuevas.

## Archivos de esta entrega

Backend: `src/album/domain/Album.ts`, `application/Albums.ts`, `infrastructure/PostgresAlbumRepository.ts`, `LocalPhotoStorage.ts`, `ExpressAlbumRouter.ts`; composición en `src/main.ts` y `src/shared/infrastructure/ServiceContainer.ts`; `docs/database/album-photos.sql` y `schema.sql`; `test/album/images.test.ts`, `test/integration/albums-postgres.test.ts`; dependencia sharp en package.json/lock; `.gitignore`; README y documentación de álbumes.

Mobile: `src/components/memories/MemoriesScreen.tsx`, `AlbumScreen.tsx`; rutas `src/app/(tabs)/memories.tsx`, `src/app/album/[id].tsx` y registro en `_layout.tsx`; botón en `ActivityDetailScreen.tsx` y enlace de finalizadas en `MapScreen.tsx`; `src/services/albums.ts`, `api.ts`; `src/types/album.ts`; `test/albums.test.ts`; módulos image-picker/image-manipulator en package.json/lock, permisos en app.json y README.

Prueba manual: crear actividad privada, inscribirse, validar PIN dentro de la ventana, finalizar, abrir Recuerdos, elegir fotos y subir. Con otra cuenta sin asistencia comprobar denegación. Para álbum público, comprobar que esa cuenta puede leer pero no subir. Probar pérdida de red y reintento; comprobar que no duplica fotos. Cámara requiere un dispositivo físico.
