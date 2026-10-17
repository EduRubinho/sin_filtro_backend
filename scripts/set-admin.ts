import { Client } from 'pg';
import { UserEmail } from '../src/user/domain/UserEmail.ts';
const email = new UserEmail(process.argv[2]).toLookupValue();
if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL.');
const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  const result = await client.query("UPDATE public.users SET role = 'admin', updated_at = CURRENT_TIMESTAMP WHERE LOWER(email) = $1 AND status = 'active' RETURNING id", [email]);
  if (!result.rowCount) throw new Error('Cuenta inexistente o inactiva.');
  console.log('Rol admin asignado. Vuelve a iniciar sesión en la app.');
} catch {
  console.error('No se pudo asignar el rol. Comprueba que exista una cuenta activa y que la migración esté aplicada.');
  process.exitCode = 1;
} finally { await client.end(); }
