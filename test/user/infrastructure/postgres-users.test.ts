import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { PostgresUserRepository } from '../../../src/user/infrastructure/PostgresUserRepository.ts';
import { UserEmail } from '../../../src/user/domain/UserEmail.ts';
import { UserId } from '../../../src/user/domain/UserId.ts';
import { UserPasswordHash } from '../../../src/user/domain/UserPasswordHash.ts';

test('adaptador PostgreSQL consulta public.users y parametriza valores', async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const pool = { async query(sql: string, values: unknown[]) { calls.push({ sql, values }); return { rows: [] }; } } as unknown as Pool;
  const repository = new PostgresUserRepository(pool);
  const input = "x'or1=1--@example.com";
  await repository.findByEmail(new UserEmail(input));
  assert.equal(calls[0].sql.includes(input), false);
  assert.deepEqual(calls[0].values, [input]);
  assert.match(calls[0].sql, /FROM "public"\."users" WHERE lower\("email"\) = \$1 LIMIT 2/);
  assert.match(calls[0].sql, /"password_hash" AS "passwordHash", "created_at" AS "createdAt"/);
});

test('CRUD PostgreSQL parametriza escrituras y deja ID/fecha a la base de datos', async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const row = { id: '1', email: "x'or1=1--@example.com", passwordHash: 'stored-hash', createdAt: new Date('2026-01-01T00:00:00Z') };
  let rows = [row];
  let rowCount = 1;
  const pool = { async query(sql: string, values: unknown[]) { calls.push({ sql, values }); return { rows, rowCount }; } } as unknown as Pool;
  const repository = new PostgresUserRepository(pool);
  const created = await repository.create(new UserEmail(row.email), new UserPasswordHash(row.passwordHash));
  assert.equal(created.id.value, '1');
  assert.match(calls[0].sql, /^INSERT INTO "public"\."users" \("email", "password_hash", "role"\) VALUES \(\$1, \$2, 'user'\) RETURNING/);
  assert.deepEqual(calls[0].values, [row.email, row.passwordHash]);
  assert.equal(calls[0].sql.includes(row.email), false);
  await repository.update(new UserId('1'), { email: new UserEmail(' CHANGED@EXAMPLE.COM ') });
  assert.match(calls[1].sql, /SET "email" = \$1 WHERE "id" = \$2 AND "role" = 'user' RETURNING/);
  assert.deepEqual(calls[1].values, ['changed@example.com', '1']);
  await repository.update(new UserId('1'), { passwordHash: new UserPasswordHash('next-hash') });
  assert.match(calls[2].sql, /SET "password_hash" = \$1 WHERE "id" = \$2 AND "role" = 'user' RETURNING/);
  assert.deepEqual(calls[2].values, ['next-hash', '1']);
  await repository.update(new UserId('1'), { email: new UserEmail('both@example.com'), passwordHash: new UserPasswordHash('both-hash') });
  assert.match(calls[3].sql, /SET "email" = \$1, "password_hash" = \$2 WHERE "id" = \$3 AND "role" = 'user' RETURNING/);
  assert.deepEqual(calls[3].values, ['both@example.com', 'both-hash', '1']);
  assert.equal((await repository.findAll(10, 20)).length, 1);
  assert.match(calls[4].sql, /ORDER BY "id" ASC LIMIT \$1 OFFSET \$2/);
  assert.deepEqual(calls[4].values, [10, 20]);
  assert.equal(await repository.delete(new UserId('1')), true);
  assert.equal(calls[5].sql, `DELETE FROM "public"."users" WHERE "id" = $1 AND "role" = 'user'`);
  assert.deepEqual(calls[5].values, ['1']);
  rows = [];
  rowCount = 0;
  assert.equal(await repository.delete(new UserId('1')), false);
  assert.equal(await repository.update(new UserId('1'), { email: new UserEmail('missing@example.com') }), null);
});

test('PostgreSQL traduce conflictos únicos de create/update y conserva errores inesperados', async () => {
  let error: unknown = { code: '23505', detail: 'private-details' };
  const pool = { async query() { throw error; } } as unknown as Pool;
  const repository = new PostgresUserRepository(pool);
  const email = new UserEmail('duplicate@example.com');
  await assert.rejects(repository.create(email, new UserPasswordHash('hash')), { code: 'EMAIL_ALREADY_EXISTS' });
  await assert.rejects(repository.update(new UserId('1'), { email }), { code: 'EMAIL_ALREADY_EXISTS' });
  error = new Error('connection failed');
  await assert.rejects(repository.create(email, new UserPasswordHash('hash')), error as Error);
});

test('PostgreSQL mapea entidades, separa hashes y rechaza correos duplicados', async () => {
  const calls: unknown[][] = [];
  const row = { id: '9223372036854775807', email: 'Edu@example.com', passwordHash: 'stored-hash', createdAt: new Date('2026-01-01T00:00:00Z') };
  let rows = [row];
  const pool = { async query(_sql: string, values: unknown[]) { calls.push(values); return { rows }; } } as unknown as Pool;
  const repository = new PostgresUserRepository(pool);
  const credentials = await repository.findByEmail(new UserEmail(' EDU@EXAMPLE.COM '));
  assert.deepEqual(calls[0], ['edu@example.com']);
  assert.equal(credentials?.passwordHash.value, row.passwordHash);
  assert.equal(credentials?.createdAt.value, row.createdAt.toISOString());
  assert.deepEqual(credentials?.toPrimitives(), { id: row.id, email: row.email });
  const user = await repository.findById(new UserId(row.id));
  assert.deepEqual(calls[1], [row.id]);
  assert.deepEqual(user?.toPrimitives(), { id: row.id, email: row.email });
  rows = [row, row];
  await assert.rejects(repository.findByEmail(new UserEmail(row.email)), /Correo duplicado/);
  rows = [];
  assert.equal(await repository.findById(new UserId(row.id)), null);
  rows = [{ ...row, email: 'invalid' }];
  await assert.rejects(repository.findById(new UserId(row.id)), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal('code' in error, false);
    assert.match(error.message, /Datos de usuario inválidos/);
    return true;
  });
});
