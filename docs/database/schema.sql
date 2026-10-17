-- Esquema inicial completo: ejecutar UNA VEZ en una base nueva y vacía con PostGIS instalado.
-- Crea la estructura desde cero; no importa cuentas ni actualiza esquemas anteriores.
BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;

-- Cuenta, rol y perfil en una única definición completa.
-- Los nuevos campos del perfil se completan durante el onboarding.
CREATE TABLE public.users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(254) NOT NULL CHECK (email = BTRIM(email) AND email <> ''),
    role VARCHAR(20) NOT NULL DEFAULT 'user' CONSTRAINT users_role_check CHECK (role IN ('user', 'admin')),
    password_hash TEXT NOT NULL CHECK (password_hash <> ''),
    display_name VARCHAR(80) CHECK (BTRIM(display_name) <> ''),
    bio VARCHAR(500),
    avatar_storage_key TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
    onboarding_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (onboarding_completed_at IS NULL OR display_name IS NOT NULL)
);
CREATE UNIQUE INDEX users_email_lower_unique ON public.users (LOWER(email));

-- Un catálogo compartido por los intereses del perfil y las categorías de planes.
CREATE TABLE public.categories (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL CHECK (BTRIM(name) <> ''),
    icon_name VARCHAR(60),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE public.user_interests (
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    category_id BIGINT NOT NULL REFERENCES public.categories(id),
    PRIMARY KEY (user_id, category_id)
);
CREATE INDEX user_interests_category_idx ON public.user_interests (category_id);

-- Solo la última posición, no un historial de movimientos.
-- Guardar una posición no habilita por sí solo su aparición en un radar de personas.
CREATE TABLE public.user_locations (
    user_id BIGINT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    location GEOGRAPHY(POINT, 4326) NOT NULL CHECK (NOT ST_IsEmpty(location::geometry)),
    accuracy_m REAL CHECK (accuracy_m >= 0 AND accuracy_m < 'Infinity'::real),
    share_in_radar BOOLEAN NOT NULL DEFAULT FALSE,
    recorded_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    CHECK (expires_at > recorded_at)
);
CREATE INDEX user_locations_geo_idx ON public.user_locations USING GIST (location);
CREATE INDEX user_locations_expiry_idx ON public.user_locations (expires_at);

-- Cada actividad conserva su propio lugar y punto histórico; no hay catálogo places.
CREATE TABLE public.activities (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organizer_id BIGINT NOT NULL REFERENCES public.users(id),
    category_id BIGINT NOT NULL REFERENCES public.categories(id),
    title VARCHAR(140) NOT NULL CHECK (BTRIM(title) <> ''),
    description TEXT NOT NULL DEFAULT '',
    location_name VARCHAR(160) NOT NULL CHECK (BTRIM(location_name) <> ''),
    address TEXT,
    location GEOGRAPHY(POINT, 4326) NOT NULL CHECK (NOT ST_IsEmpty(location::geometry)),
    meeting_details VARCHAR(250),
    cover_storage_key TEXT,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    time_zone TEXT NOT NULL DEFAULT 'America/Lima',
    price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0 AND price <> 'NaN'::numeric),
    currency VARCHAR(3) NOT NULL DEFAULT 'PEN' CHECK (currency ~ '^[A-Z]{3}$'),
    capacity INTEGER CHECK (capacity > 0),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    CHECK (ends_at > starts_at),
    CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
    CHECK (completed_at IS NULL OR completed_at >= starts_at)
);
CREATE INDEX activities_geo_idx ON public.activities USING GIST (location)
    WHERE deleted_at IS NULL AND status IN ('published', 'completed');
CREATE INDEX activities_start_idx ON public.activities (starts_at, id)
    WHERE deleted_at IS NULL AND status = 'published';
CREATE INDEX activities_end_idx ON public.activities (ends_at DESC, id DESC)
    WHERE deleted_at IS NULL AND status IN ('published', 'completed');
CREATE INDEX activities_organizer_idx ON public.activities (organizer_id);
CREATE INDEX activities_category_idx ON public.activities (category_id);

CREATE TABLE public.activity_participants (
    activity_id BIGINT NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES public.users(id),
    status TEXT NOT NULL DEFAULT 'joined' CHECK (status IN ('joined', 'left', 'removed')),
    experience TEXT CHECK (experience IN ('first_time', 'experienced')),
    introduction VARCHAR(160),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Inscripción y asistencia son independientes. Apuntarse no valida asistencia.
    attendance_validated_at TIMESTAMPTZ,
    attendance_code_id UUID,
    attendance_revoked_at TIMESTAMPTZ,
    pin_failed_attempts SMALLINT NOT NULL DEFAULT 0 CHECK (pin_failed_attempts BETWEEN 0 AND 5),
    pin_locked_until TIMESTAMPTZ,
    last_read_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (activity_id, user_id),
    CHECK ((attendance_validated_at IS NULL) = (attendance_code_id IS NULL)),
    CHECK (attendance_revoked_at IS NULL OR
        (attendance_validated_at IS NOT NULL AND attendance_revoked_at >= attendance_validated_at))
);
CREATE INDEX activity_participants_user_idx ON public.activity_participants (user_id, status);
CREATE INDEX activity_participants_attendance_idx ON public.activity_participants (user_id, activity_id)
    WHERE attendance_validated_at IS NOT NULL AND attendance_revoked_at IS NULL;

-- PIN COMPARTIDO por evento, validado individualmente desde cada cuenta.
-- Guardar HMAC-SHA-256(id + activity_id + PIN, secreto del backend), nunca el PIN.
-- Rotar = revocar la fila anterior e insertar una nueva dentro de una transacción.
CREATE TABLE public.activity_checkin_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id BIGINT NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    issued_by BIGINT NOT NULL REFERENCES public.users(id),
    pin_hash TEXT NOT NULL CHECK (pin_hash ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    UNIQUE (activity_id, id),
    CHECK (expires_at > valid_from),
    CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE UNIQUE INDEX activity_checkin_codes_current_idx ON public.activity_checkin_codes (activity_id)
    WHERE revoked_at IS NULL;
CREATE INDEX activity_checkin_codes_issuer_idx ON public.activity_checkin_codes (issued_by);

-- Estas FK se declaran después de crear las tablas relacionadas.
-- Forman parte de la instalación inicial; no son migraciones de datos antiguos.
-- Impide validar un participante con un código perteneciente a otro evento.
ALTER TABLE public.activity_participants ADD CONSTRAINT participant_attendance_code_fk
    FOREIGN KEY (activity_id, attendance_code_id)
    REFERENCES public.activity_checkin_codes (activity_id, id);

-- El organizador también debe tener una fila de participante.
-- Insertar actividad y organizador dentro de la MISMA transacción.
ALTER TABLE public.activities ADD CONSTRAINT activities_organizer_membership_fk
    FOREIGN KEY (id, organizer_id)
    REFERENCES public.activity_participants (activity_id, user_id)
    DEFERRABLE INITIALLY DEFERRED;

-- Un chat por actividad: no hace falta duplicar sus miembros en otra tabla.
CREATE TABLE public.activity_messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    activity_id BIGINT NOT NULL,
    sender_id BIGINT NOT NULL,
    body TEXT,
    attachment_storage_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    FOREIGN KEY (activity_id, sender_id)
        REFERENCES public.activity_participants (activity_id, user_id) ON DELETE CASCADE,
    CHECK ((body IS NOT NULL AND BTRIM(body) <> '')
        OR (attachment_storage_key IS NOT NULL AND BTRIM(attachment_storage_key) <> ''))
);
CREATE INDEX activity_messages_history_idx ON public.activity_messages (activity_id, id DESC);
CREATE INDEX activity_messages_sender_idx ON public.activity_messages (sender_id);

-- Supuesto del MVP: máximo un álbum por actividad; no álbumes independientes.
CREATE TABLE public.albums (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    activity_id BIGINT NOT NULL UNIQUE REFERENCES public.activities(id) ON DELETE CASCADE,
    created_by BIGINT NOT NULL,
    title VARCHAR(140) NOT NULL CHECK (BTRIM(title) <> ''),
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    FOREIGN KEY (activity_id, created_by)
        REFERENCES public.activity_participants (activity_id, user_id)
);
CREATE INDEX albums_creator_idx ON public.albums (created_by);

CREATE TABLE public.album_photos (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    album_id BIGINT NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
    uploaded_by BIGINT NOT NULL REFERENCES public.users(id),
    storage_key TEXT NOT NULL UNIQUE CHECK (BTRIM(storage_key) <> ''),
    caption VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);
CREATE INDEX album_photos_album_idx ON public.album_photos (album_id, id);
CREATE INDEX album_photos_uploader_idx ON public.album_photos (uploaded_by);

-- QR = URL con un token aleatorio. En BD solo se conserva su hash SHA-256.
-- El enlace no omite las reglas de visibilidad ni autoriza subidas anónimas.
CREATE TABLE public.album_links (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    album_id BIGINT NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
    created_by BIGINT NOT NULL REFERENCES public.users(id),
    token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    CHECK (expires_at > created_at)
);
CREATE INDEX album_links_album_idx ON public.album_links (album_id);
CREATE INDEX album_links_creator_idx ON public.album_links (created_by);

-- Preparadas para sustituir sesiones en memoria y agregar recuperación de cuenta.
-- La propuesta SQL por sí sola NO conecta estos mecanismos al backend actual.
CREATE TABLE public.user_sessions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    CHECK (expires_at > created_at)
);
CREATE INDEX user_sessions_user_idx ON public.user_sessions (user_id);
CREATE INDEX user_sessions_expiry_idx ON public.user_sessions (expires_at);

CREATE TABLE public.password_reset_tokens (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    CHECK (expires_at > created_at)
);
CREATE INDEX password_reset_tokens_user_idx ON public.password_reset_tokens (user_id);
CREATE INDEX password_reset_tokens_expiry_idx ON public.password_reset_tokens (expires_at);

CREATE FUNCTION public.set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['users', 'activities', 'activity_participants', 'albums', 'album_photos']
    LOOP
        EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', table_name);
    END LOOP;
END;
$$;

INSERT INTO public.categories (slug, name, icon_name) VALUES
    ('deporte', 'Deporte', 'football-outline'),
    ('musica', 'Música', 'musical-notes-outline'),
    ('cafe', 'Café', 'cafe-outline'),
    ('arte', 'Arte', 'color-palette-outline');

COMMIT;
