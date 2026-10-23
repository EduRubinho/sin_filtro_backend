import { ConflictError } from '../../shared/domain/ConflictError.ts';
import type { ProfileInput, Category } from '../domain/UserProfile.ts';
import { InvalidArgumentError } from '../../shared/domain/InvalidArgumentError.ts';
import { AuthError } from '../domain/AuthError.ts';
import type { Pool } from 'pg';
import { User, type UserRecord } from '../domain/User.ts';
import type { UserRepository, UserChanges } from '../domain/UserRepository.ts';
import type { UserEmail } from '../domain/UserEmail.ts';
import type { UserId } from '../domain/UserId.ts';
import type { UserPasswordHash } from '../domain/UserPasswordHash.ts';
import { UserAlreadyExistsError } from '../domain/UserAlreadyExistsError.ts';

// Esquema de usuarios y perfil: docs/database/schema.sql.
const USER_FIELDS = '"id"::text AS id, "email", "password_hash" AS "passwordHash", "created_at" AS "createdAt", "role", "status", "display_name" AS "displayName", "bio", "onboarding_completed_at" AS "onboardingCompletedAt", ARRAY(SELECT ui.category_id::text FROM public.user_interests ui WHERE ui.user_id = users.id ORDER BY ui.category_id) AS "interestIds"';

function userFromRow(row: UserRecord): User {
  try {
    return User.fromPrimitives(row);
  } catch (cause) {
    throw new Error('Datos de usuario inválidos en PostgreSQL.', { cause });
  }
}

export class PostgresUserRepository implements UserRepository {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async findCategories(): Promise<Category[]> {
    const result = await this.pool.query<Category>('SELECT id::text, name, slug FROM public.categories WHERE is_active = TRUE ORDER BY id');
    return result.rows;
  }

  async updateProfile(id: UserId, profile: ProfileInput): Promise<User | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT role, status FROM public.users WHERE id = $1 FOR UPDATE', [id.value]);
      if (!current.rows[0]) { await client.query('ROLLBACK'); return null; }
      if (current.rows[0].status !== 'active') throw new AuthError('UNAUTHORIZED');
      if (current.rows[0].role !== 'user') throw new AuthError('FORBIDDEN');
      const categories = await client.query('SELECT id FROM public.categories WHERE id = ANY($1::bigint[]) AND is_active = TRUE FOR SHARE', [profile.interestIds]);
      if (categories.rows.length !== profile.interestIds.length) throw new InvalidArgumentError('Uno de los intereses ya no está disponible. Vuelve a seleccionarlos.');
      await client.query(`UPDATE public.users SET display_name = $2, bio = $3,
        onboarding_completed_at = COALESCE(onboarding_completed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id.value, profile.displayName, profile.bio]);
      await client.query('DELETE FROM public.user_interests WHERE user_id = $1', [id.value]);
      await client.query('INSERT INTO public.user_interests (user_id, category_id) SELECT $1, unnest($2::bigint[])', [id.value, profile.interestIds]);
      const result = await client.query<UserRecord>(`SELECT ${USER_FIELDS} FROM public.users WHERE id = $1`, [id.value]);
      const user = userFromRow(result.rows[0]);
      await client.query('COMMIT');
      return user;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async findByEmail(email: UserEmail): Promise<User | null> {
    const result = await this.pool.query<UserRecord>(
      `SELECT ${USER_FIELDS} FROM "public"."users" WHERE lower("email") = $1 LIMIT 2`,
      [email.toLookupValue()],
    );
    if (result.rows.length > 1) throw new Error('Correo duplicado en la tabla de usuarios.');
    return result.rows[0] ? userFromRow(result.rows[0]) : null;
  }

  async findById(id: UserId): Promise<User | null> {
    const result = await this.pool.query<UserRecord>(
      `SELECT ${USER_FIELDS} FROM "public"."users" WHERE "id" = $1`, [id.value],
    );
    return result.rows[0] ? userFromRow(result.rows[0]) : null;
  }

  async findAll(limit: number, offset: number): Promise<User[]> {
    const result = await this.pool.query<UserRecord>(
      `SELECT ${USER_FIELDS} FROM "public"."users" WHERE "role" = 'user' ORDER BY "id" ASC LIMIT $1 OFFSET $2`, [limit, offset],
    );
    return result.rows.map(userFromRow);
  }

  async create(email: UserEmail, passwordHash: UserPasswordHash): Promise<User> {
    try {
      const result = await this.pool.query<UserRecord>(
        `INSERT INTO "public"."users" ("email", "password_hash", "role") VALUES ($1, $2, 'user') RETURNING ${USER_FIELDS}`,
        [email.toLookupValue(), passwordHash.value],
      );
      return userFromRow(result.rows[0]);
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  async update(id: UserId, changes: UserChanges): Promise<User | null> {
    const assignments: string[] = [];
    const values: string[] = [];
    if (changes.email) {
      values.push(changes.email.toLookupValue());
      assignments.push(`"email" = $${values.length}`);
    }
    if (changes.passwordHash) {
      values.push(changes.passwordHash.value);
      assignments.push(`"password_hash" = $${values.length}`);
    }
    if (assignments.length === 0) return this.findById(id);
    values.push(id.value);
    try {
      const result = await this.pool.query<UserRecord>(
        `UPDATE "public"."users" SET ${assignments.join(', ')} WHERE "id" = $${values.length} AND "role" = 'user' RETURNING ${USER_FIELDS}`,
        values,
      );
      return result.rows[0] ? userFromRow(result.rows[0]) : null;
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  async delete(id: UserId): Promise<boolean> {
    try {
      const result = await this.pool.query(`DELETE FROM "public"."users" WHERE "id" = $1 AND "role" = 'user'`, [id.value]);
      return result.rowCount === 1;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23503') {
        throw new ConflictError('No se puede eliminar un usuario relacionado con eventos u otros registros.');
      }
      throw error;
    }
  }

  private rethrowWriteError(error: unknown): never {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw new UserAlreadyExistsError();
    }
    throw error;
  }
}
