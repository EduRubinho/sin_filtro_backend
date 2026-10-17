import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test, type TestContext } from 'node:test';
import { createHttpApp } from '../../../src/shared/infrastructure/HttpApp.ts';
import { ServiceContainer } from '../../../src/shared/infrastructure/ServiceContainer.ts';
import { ExpressUserRouter } from '../../../src/user/infrastructure/ExpressUserRouter.ts';
import { InMemoryUserRepository } from '../../../src/user/infrastructure/InMemoryUserRepository.ts';
import { memorySessions } from '../../../src/user/infrastructure/InMemorySessionRepository.ts';
import { User } from '../../../src/user/domain/User.ts';
import { passwords, user } from '../../support/auth-fixture.ts';

async function start(t: TestContext, environment = 'development') {
  const admin = User.fromPrimitives({ ...user, role: 'admin' });
  const sessions = memorySessions();
  const adminSession = await sessions.create(admin);
  const cases = new ServiceContainer(new InMemoryUserRepository([admin]), passwords, sessions).user;
  const server = createHttpApp(ExpressUserRouter(cases, environment)).listen(0, '127.0.0.1');
  t.after(() => { server.closeAllConnections(); server.close(); });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return (path: string, method = 'GET', body?: unknown, headers = {}) => fetch(`http://127.0.0.1:${address.port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(path.startsWith('/users') ? { Authorization: `Bearer ${adminSession.token}` } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test('CRUD HTTP de administrador en desarrollo: crear, listar, consultar, editar y eliminar', async (t) => {
  const request = await start(t);
  const created = await request('/users', 'POST', { email: ' NEW@EXAMPLE.COM ', password: 'secret123' });
  assert.equal(created.status, 201);
  const { user } = await created.json();
  assert.equal(created.headers.get('location'), `/users/${user.id}`);
  assert.deepEqual(Object.keys(user).sort(), ['createdAt', 'email', 'id', 'profile', 'role', 'status']);
  assert.equal(user.email, 'new@example.com');
  assert.deepEqual(await (await request('/users?offset=1')).json(), { users: [user] });
  assert.deepEqual(await (await request(`/users/${user.id}`)).json(), { user });
  assert.deepEqual(await (await request('/users?limit=1&offset=2')).json(), { users: [] });
  const login = await request('/auth/login', 'POST', { email: user.email, password: 'secret123' });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  const edited = await request(`/users/${user.id}`, 'PATCH', { email: 'updated@example.com', password: 'changed123' });
  assert.equal(edited.status, 200);
  assert.deepEqual(await edited.json(), { user: { ...user, email: 'updated@example.com' } });
  assert.equal((await request('/auth/me', 'GET', undefined, { Authorization: `Bearer ${token}` })).status, 401);
  assert.equal((await request('/auth/login', 'POST', { email: 'updated@example.com', password: 'changed123' })).status, 200);
  const removed = await request(`/users/${user.id}`, 'DELETE');
  assert.equal(removed.status, 204);
  assert.equal(await removed.text(), '');
  assert.equal((await request(`/users/${user.id}`)).status, 404);
  assert.equal((await request(`/users/${user.id}`, 'DELETE')).status, 404);
});

test('CRUD HTTP responde 400, 404 y 409 con errores públicos', async (t) => {
  const request = await start(t);
  await request('/users', 'POST', { email: 'one@example.com', password: 'secret123' });
  await request('/users', 'POST', { email: 'two@example.com', password: 'secret123' });
  const duplicate = await request('/users', 'POST', { email: ' ONE@EXAMPLE.COM ', password: 'secret123' });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error.code, 'EMAIL_ALREADY_EXISTS');
  assert.equal((await request('/users/3', 'PATCH', { email: 'one@example.com' })).status, 409);
  const missing = await request('/users/99');
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'USER_NOT_FOUND');
  assert.equal((await request('/users/99', 'PATCH', { email: 'missing@example.com' })).status, 404);
  for (const path of ['/users/abc', '/users/9223372036854775808', '/users?limit=101', '/users?offset=-1', '/users?limit=1&limit=2']) {
    assert.equal((await request(path)).status, 400, path);
  }
  assert.equal((await request('/users', 'POST', { email: 'bad', password: 'secret123' })).status, 400);
  assert.equal((await request('/users/1', 'PATCH', { id: '2' })).status, 400);
  assert.equal((await request('/users/1', 'PATCH', {})).status, 400);
});

test('CRUD público no se registra en producción; autenticación sigue disponible', async (t) => {
  const request = await start(t, 'production');
  for (const [method, path] of [['GET', '/users'], ['GET', '/users/1'], ['POST', '/users'], ['PATCH', '/users/1'], ['DELETE', '/users/1']]) {
    assert.equal((await request(path, method)).status, 404);
  }
  assert.equal((await request('/auth/me')).status, 401);
});
