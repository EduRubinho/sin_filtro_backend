-- Ejecutar una vez en la base existente antes de iniciar el backend actualizado.
BEGIN;
ALTER TABLE public.activities ADD COLUMN album_visibility TEXT NOT NULL DEFAULT 'private'
  CHECK (album_visibility IN ('public','private'));
-- Conserva la visibilidad de álbumes existentes; el resto empieza privado.
UPDATE public.activities a SET album_visibility=b.visibility FROM public.albums b WHERE b.activity_id=a.id;

CREATE FUNCTION public.lock_activity_album_visibility() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' AND NEW.album_visibility <> OLD.album_visibility THEN
    RAISE EXCEPTION 'La privacidad queda fija desde la publicación' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER activity_album_visibility_locked BEFORE UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.lock_activity_album_visibility();

CREATE FUNCTION public.check_album_visibility() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE activity public.activities;
BEGIN
  SELECT * INTO activity FROM public.activities WHERE id=NEW.activity_id FOR SHARE;
  IF activity.album_visibility <> NEW.visibility THEN
    RAISE EXCEPTION 'La privacidad del álbum debe coincidir con la actividad' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' AND (activity.deleted_at IS NOT NULL OR NOT
    (activity.status='completed' OR (activity.status='published' AND activity.ends_at<=clock_timestamp()))) THEN
    RAISE EXCEPTION 'El álbum se habilita al finalizar la actividad' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER album_visibility_matches BEFORE INSERT OR UPDATE ON public.albums
  FOR EACH ROW EXECUTE FUNCTION public.check_album_visibility();
COMMIT;
