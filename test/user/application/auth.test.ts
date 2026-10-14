import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ServiceContainer } from '../../../src/shared/infrastructure/ServiceContainer.ts';
import { memorySessions } from '../../../src/user/infrastructure/InMemorySessionRepository.ts';
import { SessionToken } from '../../../src/user/domain/SessionToken.ts';
import { User } from '../../../src/user/domain/User.ts';
import { users, passwords, user, hash, createUsers } from '../../support/auth-fixture.ts';

test('normaliza correo, preserva contraseña y nunca expone el hash', async () => {
  const auth = new ServiceContainer(users, passwords, memorySessions());
  const session = await auth.user.login.execute({ email: ' EDU@EXAMPLE.COM ', password: ' contraseña de prueba ' });
  assert.deepEqual(session.user, { id: '1', email: user.email });
  assert.equal(JSON.stringify(session).includes(hash), false);
  assert.equal((await auth.user.getCurrent.execute(session.token)).id, '1');
  await auth.user.logout.execute(session.token);
  await assert.rejects(auth.user.getCurrent.execute(session.token), { code: 'UNAUTHORIZED' });
});

test('usuario inexistente y contraseña errónea tienen el mismo error', async () => {
  const auth = new ServiceContainer(users, passwords, memorySessions());
  for (const email of [user.email, 'missing@example.com']) {
    await assert.rejects(auth.user.login.execute({ email, password: 'incorrecta' }), { code: 'UNAUTHORIZED' });
  }
  await assert.rejects(auth.user.login.execute({ email: user.email, password: 'contraseña de prueba' }), { code: 'UNAUTHORIZED' });
});

test('rechaza entradas inválidas antes de acceder a la BD', async () => {
  const inaccessible = createUsers({ async findByEmail() { throw new Error('No debe consultar'); } });
  const auth = new ServiceContainer(inaccessible, passwords, memorySessions());
  for (const input of [null, {}, { email: 'invalid', password: 'a' }, { email: user.email, password: '' }, { email: user.email, password: 'a'.repeat(1025) }]) {
    await assert.rejects(auth.user.login.execute(input), { code: 'INVALID_INPUT' });
  }
});

test('sesión vencida o usuario eliminado no autorizan acceso', async () => {
  let now = 1000;
  const sessions = memorySessions(100, () => now);
  const session = await sessions.create(User.fromPrimitives(user));
  now = 1100;
  assert.equal(await sessions.find(new SessionToken(session.token)), null);
  const fresh = await sessions.create(User.fromPrimitives(user));
  const auth = new ServiceContainer(createUsers({ async findById() { return null; } }), passwords, sessions);
  await assert.rejects(auth.user.getCurrent.execute(fresh.token), { code: 'UNAUTHORIZED' });
  assert.equal(await sessions.find(new SessionToken(fresh.token)), null);
});

test('scrypt rechaza hashes inválidos o texto plano', async () => {
  for (const value of [null, 'contraseña de prueba', 'scrypt$1$8$1$00$00']) {
    assert.equal(await passwords.verify('contraseña de prueba', value), false);
  }
});

test('verifica el hash ficticio al faltar usuario y valida tokens fuera de HTTP', async () => {
  const calls: unknown[][] = [];
  const verifier = { hash: passwords.hash, async verify(...args: [string, string | null]) { calls.push(args); return false; } };
  const auth = new ServiceContainer(users, verifier, memorySessions());
  await assert.rejects(auth.user.login.execute({ email: 'missing@example.com', password: 'secret' }), { code: 'UNAUTHORIZED' });
  assert.deepEqual(calls, [['secret', null]]);
  await assert.rejects(auth.user.getCurrent.execute('invalid'), { code: 'UNAUTHORIZED' });
  await assert.rejects(auth.user.logout.execute('invalid'), { code: 'UNAUTHORIZED' });
  await auth.user.logout.execute('a'.repeat(43));
});
