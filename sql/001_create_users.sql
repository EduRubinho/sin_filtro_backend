-- Ejecutar sobre sin_filtro. No elimina ni reemplaza tablas existentes.
BEGIN;

CREATE TABLE public.users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(254) NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_email_valid
        CHECK (email = BTRIM(email) AND CHAR_LENGTH(email) > 0),
    CONSTRAINT users_password_hash_not_empty
        CHECK (CHAR_LENGTH(password_hash) > 0)
);

CREATE UNIQUE INDEX users_email_lower_unique
    ON public.users (LOWER(email));

COMMIT;
