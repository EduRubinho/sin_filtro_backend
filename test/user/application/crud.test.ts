import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ServiceContainer } from '../../../src/shared/infrastructure/ServiceContainer.ts';
import { InMemoryUserRepository } from '../../../src/user/infrastructure/InMemoryUserRepository.ts';
import { memorySessions } from '../../../src/user/infrastructure/InMemorySessionRepository.ts';
import { UserId } from '../../../src/user/domain/UserId.ts';
import { SessionToken } from '../../../src/user/domain/SessionToken.ts';
import { passwords } from '../../support/auth-fixture.ts';

function setup() {
  const repository = new InMemoryUserRepository();
  const sessions = memorySessions();
  const { user: cases } = new ServiceContainer(repository, passwords, sessions);
  return { repository, sessions, cases };
}

test('CRUD genera ID/fecha, guarda hash y conserva columnas omitidas al editar', async () => {
  const { repository, cases } = setup();
  const created = await cases.create.execute({ email: ' NEW@EXAMPLE.COM ', password: ' secret ' });
  assert.equal(created.id, '1');
  assert.equal(created.email, 'new@example.com');
  assert.equal(Number.isNaN(Date.parse(created.createdAt)), false);
  assert.deepEqual(Object.keys(created).sort(), ['createdAt', 'email', 'id']);
  const stored = await repository.findById(new UserId(created.id));
  assert.ok(stored);
  assert.notEqual(stored.passwordHash.value, ' secret ');
  assert.equal(await passwords.verify(' secret ', stored.passwordHash.value), true);
  assert.deepEqual(await cases.getOneById.execute(created.id), created);
  assert.deepEqual(await cases.getAll.execute(), [created]);
  const edited = await cases.edit.execute(created.id, { email: ' EDITED@EXAMPLE.COM ' });
  assert.deepEqual(edited, { ...created, email: 'edited@example.com' });
  assert.equal((await repository.findById(new UserId(created.id)))?.passwordHash.value, stored.passwordHash.value);
  await cases.delete.execute(created.id);
  await assert.rejects(cases.getOneById.execute(created.id), { code: 'USER_NOT_FOUND' });
  await assert.rejects(cases.delete.execute(created.id), { code: 'USER_NOT_FOUND' });
  assert.deepEqual(await cases.getAll.execute(), []);
});

test('editar contraseña y eliminar revocan todas las sesiones del usuario', async () => {
  const { cases, sessions } = setup();
  const user = await cases.create.execute({ email: 'one@example.com', password: 'old' });
  await cases.create.execute({ email: 'two@example.com', password: 'other' });
  const first = await cases.login.execute({ email: user.email, password: 'old' });
  const second = await cases.login.execute({ email: user.email, password: 'old' });
  const other = await cases.login.execute({ email: 'two@example.com', password: 'other' });
  assert.deepEqual(await cases.edit.execute(user.id, { password: 'new' }), user);
  assert.equal(await sessions.find(new SessionToken(first.token)), null);
  assert.equal(await sessions.find(new SessionToken(second.token)), null);
  assert.ok(await sessions.find(new SessionToken(other.token)));
  await assert.rejects(cases.login.execute({ email: user.email, password: 'old' }), { code: 'UNAUTHORIZED' });
  const fresh = await cases.login.execute({ email: user.email, password: 'new' });
  await cases.delete.execute(user.id);
  assert.equal(await sessions.find(new SessionToken(fresh.token)), null);
  assert.ok(await cases.getCurrent.execute(other.token));
});

test('rechaza correos duplicados sin alterar al usuario existente', async () => {
  const { cases } = setup();
  const first = await cases.create.execute({ email: 'first@example.com', password: 'secret' });
  const second = await cases.create.execute({ email: 'second@example.com', password: 'secret' });
  await assert.rejects(cases.create.execute({ email: ' FIRST@EXAMPLE.COM ', password: 'other' }), { code: 'EMAIL_ALREADY_EXISTS' });
  await assert.rejects(cases.edit.execute(second.id, { email: 'FIRST@example.com' }), { code: 'EMAIL_ALREADY_EXISTS' });
  assert.deepEqual(await cases.getOneById.execute(second.id), second);
  assert.deepEqual(await cases.edit.execute(first.id, { email: first.email }), first);
});

test('valida entradas, campos de solo lectura, IDs BIGINT y paginación', async () => {
  const { cases } = setup();
  for (const input of [null, [], {}, { email: 'invalid', password: 'a' },
    { email: 'a@example.com', password: '' }, { email: 'a@example.com', password: 'a', id: '9' },
    { email: 'a@example.com', passwordHash: 'hash' }, { email: 'a@example.com', password: 'a', createdAt: '2026-01-01' }]) {
    await assert.rejects(cases.create.execute(input), { code: 'INVALID_INPUT' });
  }
  for (const input of [null, [], {}, { passwordHash: 'hash' }, { email: null }, { createdAt: '2026-01-01' }]) {
    await assert.rejects(cases.edit.execute('1', input), { code: 'INVALID_INPUT' });
  }
  for (const id of ['abc', '-1', '0', '1.5', '9223372036854775808', "1' OR 1=1"]) {
    await assert.rejects(cases.getOneById.execute(id), { code: 'INVALID_INPUT' });
  }
  for (const [limit, offset] of [[0, 0], [101, 0], [1.5, 0], [10, -1], [10, NaN]]) {
    await assert.rejects(cases.getAll.execute(limit, offset), { code: 'INVALID_INPUT' });
  }
  await assert.rejects(cases.edit.execute('1', { email: 'missing@example.com' }), { code: 'USER_NOT_FOUND' });
  assert.deepEqual(await cases.getAll.execute(), []);
});
