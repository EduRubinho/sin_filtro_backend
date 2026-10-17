import { User } from '../../../src/user/domain/User.ts';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createHttpApp } from '../../../src/shared/infrastructure/HttpApp.ts';
import { ExpressUserRouter } from '../../../src/user/infrastructure/ExpressUserRouter.ts';
import { ServiceContainer } from '../../../src/shared/infrastructure/ServiceContainer.ts';
import { memorySessions } from '../../../src/user/infrastructure/InMemorySessionRepository.ts';
import { users, passwords, user, createUsers } from '../../support/auth-fixture.ts';

test('contrato HTTP: login, /me, logout, errores y límite de intentos', async (t) => {
  const app = createHttpApp(ExpressUserRouter(new ServiceContainer(users, passwords, memorySessions()).user));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => { server.closeAllConnections(); server.close(); });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: ' contraseña de prueba ' }) });
  assert.equal(login.status, 200);
  assert.equal(login.headers.get('cache-control'), 'no-store');
  const data = await login.json();
  assert.deepEqual(data.user, User.fromPrimitives(user).toAuth());
  assert.match(data.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Number.isNaN(Date.parse(data.expiresAt)), false);
  const headers = { Authorization: `Bearer ${data.token}` };
  const me = await fetch(`${base}/auth/me`, { headers });
  assert.equal(me.status, 200);
  assert.deepEqual(await me.json(), { user: User.fromPrimitives(user).toAuth() });
  assert.equal((await fetch(`${base}/auth/me`)).status, 401);
  assert.equal((await fetch(`${base}/auth/logout`, { method: 'POST', headers })).status, 204);
  assert.equal((await fetch(`${base}/auth/me`, { headers })).status, 401);
  assert.equal((await fetch(`${base}/auth/logout`, { method: 'POST', headers })).status, 204);
  const malformed = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  for (let i = 0; i < 8; i++) assert.equal((await fetch(`${base}/auth/login`, { method: 'POST' })).status, 400);
  assert.equal((await fetch(`${base}/auth/login`, { method: 'POST' })).status, 429);
});

test('HTTP conserva errores de entrada, tamaño, token, ruta e infraestructura', async (t) => {
  const failingUsers = createUsers({ async findByEmail() { throw new Error('private-database-details'); } });
  const app = createHttpApp(ExpressUserRouter(new ServiceContainer(failingUsers, passwords, memorySessions()).user));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => { server.closeAllConnections(); server.close(); });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const post = (body: unknown) => fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const invalid = await post({ email: 'invalid', password: 'a' });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: { code: 'INVALID_INPUT', message: 'Ingresa un correo válido y tu contraseña.' } });
  assert.equal((await post({ email: user.email, password: 'a'.repeat(9000) })).status, 413);
  const failure = await post({ email: user.email, password: 'a'.repeat(8) });
  assert.equal(failure.status, 500);
  assert.deepEqual(await failure.json(), { error: { code: 'INTERNAL_ERROR', message: 'No se pudo completar la solicitud.' } });
  for (const authorization of ['Basic abc', 'Bearer invalid', `Bearer ${'a'.repeat(44)}`]) {
    assert.equal((await fetch(`${base}/auth/me`, { headers: { Authorization: authorization } })).status, 401);
  }
  assert.equal((await fetch(`${base}/missing`)).status, 404);
});
