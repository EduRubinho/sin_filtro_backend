import { Pool } from 'pg';

export function createPostgresPool(connectionString: string): Pool {
  const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000, query_timeout: 5000 });
  pool.on('error', () => { console.error('Error en una conexión PostgreSQL inactiva.'); });
  return pool;
}

export function postgresStartupMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const hints: Record<string, string> = {
    '42P01': 'No existe una tabla requerida. Revisa que la base de datos tenga las migraciones SQL del proyecto aplicadas.',
    '42703': 'No existe una columna requerida. Revisa que el esquema de la base de datos coincida con las migraciones SQL del proyecto.',
    '28P01': 'PostgreSQL rechazó las credenciales. Revisa el usuario y la contraseña de DATABASE_URL.',
    '3D000': 'No existe la base de datos indicada en DATABASE_URL.',
    '42501': 'El usuario de PostgreSQL no tiene los permisos necesarios para consultar la tabla.',
    ECONNREFUSED: 'PostgreSQL no acepta conexiones. Revisa que esté iniciado y verifica el host y puerto de DATABASE_URL.',
  };
  return (hints[code] ?? 'No se pudo validar PostgreSQL. Revisa DATABASE_URL, las migraciones y los permisos de lectura.');
}
