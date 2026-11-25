-- Reejecutable: añade metadatos de archivos, sin borrar tablas ni datos.
BEGIN;
ALTER TABLE public.album_photos ADD COLUMN IF NOT EXISTS size_bytes INTEGER NOT NULL DEFAULT 0 CHECK(size_bytes>=0);
ALTER TABLE public.album_photos ADD COLUMN IF NOT EXISTS width INTEGER NOT NULL DEFAULT 0 CHECK(width>=0);
ALTER TABLE public.album_photos ADD COLUMN IF NOT EXISTS height INTEGER NOT NULL DEFAULT 0 CHECK(height>=0);
ALTER TABLE public.album_photos ADD COLUMN IF NOT EXISTS upload_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS album_photos_upload_id_unique ON public.album_photos(uploaded_by,upload_id);
COMMIT;
