import type { Pool } from 'pg';
import { User, type UserRecord } from '../domain/User.ts';
import type { UserRepository, UserChanges } from '../domain/UserRepository.ts';
import type { UserEmail } from '../domain/UserEmail.ts';
import type { UserId } from '../domain/UserId.ts';
import type { UserPasswordHash } from '../domain/UserPasswordHash.ts';
import { UserAlreadyExistsError } from '../domain/UserAlreadyExistsError.ts';

// El esquema pertenece al repositorio y se versiona en sql/001_create_users.sql.
const USER_FIELDS = '"id"::text AS id, "email", "password_hash" AS "passwordHash", "created_at" AS "createdAt"';

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
      `SELECT ${USER_FIELDS} FROM "public"."users" ORDER BY "id" ASC LIMIT $1 OFFSET $2`, [limit, offset],
    );
    return result.rows.map(userFromRow);
  }

  async create(email: UserEmail, passwordHash: UserPasswordHash): Promise<User> {
    try {
      const result = await this.pool.query<UserRecord>(
        `INSERT INTO "public"."users" ("email", "password_hash") VALUES ($1, $2) RETURNING ${USER_FIELDS}`,
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
        `UPDATE "public"."users" SET ${assignments.join(', ')} WHERE "id" = $${values.length} RETURNING ${USER_FIELDS}`,
        values,
      );
      return result.rows[0] ? userFromRow(result.rows[0]) : null;
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  async delete(id: UserId): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM "public"."users" WHERE "id" = $1', [id.value]);
    return result.rowCount === 1;
  }

  private rethrowWriteError(error: unknown): never {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw new UserAlreadyExistsError();
    }
    throw error;
  }
}
