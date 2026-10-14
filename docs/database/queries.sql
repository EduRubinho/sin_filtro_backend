-- Propuesta: consultas independientes para node-postgres (pg).
-- $n son parámetros, no interpolar texto. No ejecutar todo como una migración.
-- Validar longitud [-180,180], latitud [-90,90], radio finito > 0 (máximo 10000 m),
-- limit [1,100], offset >= 0. IDs de usuario salen de la sesión, NUNCA del cliente.
-- Rechazar sesiones inválidas; NULL representa solo una consulta pública anónima.

-- name: map_activities
-- MAPA: planes publicados, futuros o en curso, no eliminados.
-- $1 longitud, $2 latitud, $3 radio_m, $4 limit, $5 offset.
WITH origin AS (
    SELECT ST_SetSRID(ST_MakePoint($1::double precision, $2::double precision), 4326)::geography AS point
)
SELECT a.id, a.title, a.starts_at, a.ends_at, a.price, a.currency,
       a.location_name, a.meeting_details,
       ST_Y(a.location::geometry) AS latitude,
       ST_X(a.location::geometry) AS longitude,
       ST_Distance(a.location, o.point) AS distance_m,
       (SELECT COUNT(*) FROM public.activity_participants ap
        WHERE ap.activity_id = a.id AND ap.status = 'joined') AS participant_count
FROM public.activities a
CROSS JOIN origin o
WHERE a.deleted_at IS NULL
  AND a.status = 'published'
  AND a.ends_at > CURRENT_TIMESTAMP
  AND ST_DWithin(a.location, o.point, $3::double precision)
ORDER BY distance_m, a.starts_at, a.id
LIMIT $4 OFFSET $5;

-- name: nearby_past_albums
-- RECUERDOS CERCANOS: listado independiente; nunca se añade a los marcadores.
-- $1 longitud, $2 latitud, $3 radio_m (p.ej. 500),
-- $4 usuario autenticado o NULL, $5 limit, $6 offset.
WITH origin AS (
    SELECT ST_SetSRID(ST_MakePoint($1::double precision, $2::double precision), 4326)::geography AS point
)
SELECT a.id AS activity_id, a.title, a.location_name, a.starts_at,
       COALESCE(a.completed_at, a.ends_at) AS finished_at,
       album.id AS album_id, album.title AS album_title, album.visibility,
       ST_Distance(a.location, o.point) AS distance_m,
       (SELECT COUNT(*) FROM public.album_photos photo
        WHERE photo.album_id = album.id AND photo.deleted_at IS NULL) AS photo_count
FROM public.activities a
JOIN public.albums album ON album.activity_id = a.id
CROSS JOIN origin o
WHERE a.deleted_at IS NULL
  AND album.deleted_at IS NULL
  AND a.status IN ('published', 'completed')
  AND (a.status = 'completed' OR a.ends_at <= CURRENT_TIMESTAMP)
  AND ST_DWithin(a.location, o.point, $3::double precision)
  AND (
      album.visibility = 'public'
      OR EXISTS (
          SELECT 1 FROM public.activity_participants ap
          JOIN public.users viewer ON viewer.id = ap.user_id
          WHERE ap.activity_id = a.id
            AND ap.user_id = $4
            AND viewer.status = 'active'
            AND ap.attendance_validated_at IS NOT NULL
            AND ap.attendance_revoked_at IS NULL
      )
  )
ORDER BY distance_m, finished_at DESC, a.id DESC
LIMIT $5 OFFSET $6;

-- name: album_photos
-- LECTURA DIRECTA/QR/ZIP: misma autorización aunque se conozca el ID del álbum.
-- $1 album_id, $2 usuario autenticado o NULL, $3 limit, $4 offset.
-- En acceso por QR, validar además hash del enlace, expiración y revocación.
-- Todas las fotos heredan visibilidad del álbum. Storage keys solo para el servidor.
SELECT photo.id, photo.storage_key, photo.caption, photo.uploaded_by
FROM public.album_photos photo
JOIN public.albums album ON album.id = photo.album_id
JOIN public.activities a ON a.id = album.activity_id
WHERE album.id = $1
  AND photo.deleted_at IS NULL
  AND album.deleted_at IS NULL
  AND a.deleted_at IS NULL
  AND a.status IN ('published', 'completed')
  AND (
      album.visibility = 'public'
      OR EXISTS (
          SELECT 1 FROM public.activity_participants ap
          JOIN public.users viewer ON viewer.id = ap.user_id
          WHERE ap.activity_id = a.id
            AND ap.user_id = $2
            AND viewer.status = 'active'
            AND ap.attendance_validated_at IS NOT NULL
            AND ap.attendance_revoked_at IS NULL
      )
  )
ORDER BY photo.id DESC
LIMIT $3 OFFSET $4;

-- name: insert_album_photo
-- SUBIDA: la visibilidad pública NO concede permiso de escritura.
-- $1 album_id, $2 usuario autenticado, $3 storage_key autorizado por el servidor,
-- $4 caption. RETURNING sin filas = no autorizado/no disponible, no éxito.
-- Ejecutar dentro de una transacción que bloquee previamente actividad, álbum
-- y participante, en ese orden. Revocaciones/borrados respetan el mismo protocolo.
INSERT INTO public.album_photos (album_id, uploaded_by, storage_key, caption)
SELECT album.id, ap.user_id, $3, $4
FROM public.albums album
JOIN public.activities a ON a.id = album.activity_id
JOIN public.activity_participants ap ON ap.activity_id = a.id AND ap.user_id = $2
JOIN public.users uploader ON uploader.id = ap.user_id
WHERE album.id = $1
  AND album.deleted_at IS NULL
  AND a.deleted_at IS NULL
  AND a.status IN ('published', 'completed')
  AND uploader.status = 'active'
  AND ap.attendance_validated_at IS NOT NULL
  AND ap.attendance_revoked_at IS NULL
RETURNING id, album_id, uploaded_by, created_at;

-- name: save_latest_location
-- ÚLTIMO GPS: independiente del punto elegido para buscar recuerdos.
-- $1 usuario autenticado, $2 longitud, $3 latitud, $4 precisión_m,
-- $5 captura, $6 expiración calculada por servidor.
-- Validar reloj/antigüedad/precisión. El consentimiento se modifica por separado.
INSERT INTO public.user_locations (user_id, location, accuracy_m, recorded_at, expires_at)
VALUES ($1, ST_SetSRID(ST_MakePoint($2::double precision, $3::double precision), 4326)::geography, $4, $5, $6)
ON CONFLICT (user_id) DO UPDATE
SET location = EXCLUDED.location,
    accuracy_m = EXCLUDED.accuracy_m,
    recorded_at = EXCLUDED.recorded_at,
    expires_at = EXCLUDED.expires_at
WHERE EXCLUDED.recorded_at > user_locations.recorded_at;
