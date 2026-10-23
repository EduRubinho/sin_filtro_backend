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
  const repository = new InMemoryUserRepository([User.fromPrimitives({ ...user, role: 'admin' })]);
  const cases = new ServiceContainer(repository, passwords, memorySessions()).user;
  const previousEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = environment;
  const routes = ExpressUserRouter(cases);
  if (previousEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousEnvironment;
  const server = createHttpApp(routes).listen(0, '127.0.0.1');
  t.after(() => { server.closeAllConnections(); server.close(); });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return (path: string, method = 'GET', body?: unknown, token?: string) => fetch(`http://127.0.0.1:${address.port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test('registro público, perfil persistente y restricciones de rol en producción', async t => {
  const request = await start(t, 'production');
  const credentials = { email: ' NEW@EXAMPLE.COM ', password: ' password123 ' };
  for (const body of [{ ...credentials, role: 'admin' }, { ...credentials, id: '1' }, { ...credentials, password: 'short' }]) {
    assert.equal((await request('/auth/register', 'POST', body)).status, 400);
  }
  const response = await request('/auth/register', 'POST', credentials);
  assert.equal(response.status, 201);
  const session = await response.json();
  assert.equal(session.user.email, 'new@example.com');
  assert.equal(session.user.role, 'user');
  assert.equal(session.user.profile.completed, false);
  assert.equal(JSON.stringify(session).includes('password'), false);
  assert.equal((await request('/auth/register', 'POST', credentials)).status, 409);
  const profile = { displayName: '  Valentina  ', bio: '  Me gusta el vóley.  ', interestIds: ['1', '2'] };
  assert.equal((await request('/auth/profile', 'PATCH', profile)).status, 401);
  for (const body of [{ ...profile, role: 'admin' }, { ...profile, id: '1' }, { ...profile, interestIds: ['1'] },
    { ...profile, interestIds: ['1', '1'] }, { ...profile, interestIds: ['1', '999'] }, { ...profile, displayName: '  ' }]) {
    assert.equal((await request('/auth/profile', 'PATCH', body, session.token)).status, 400);
  }
  assert.equal((await (await request('/auth/me', 'GET', undefined, session.token)).json()).user.profile.completed, false);
  const saved = await request('/auth/profile', 'PATCH', profile, session.token);
  assert.equal(saved.status, 200);
  const data = await saved.json();
  assert.deepEqual(data.user.profile, { displayName: 'Valentina', bio: 'Me gusta el vóley.', interestIds: ['1', '2'], completed: true });
  const next = await (await request('/auth/login', 'POST', { ...credentials, role: 'admin' })).json();
  assert.deepEqual(next.user, data.user);
  assert.equal(next.user.role, 'user');
  assert.equal((await (await request('/categories')).json()).categories.length, 4);
});

test('mismo login distingue administrador; usuario no puede acceder al CRUD ni editar perfil ajeno', async t => {
  const request = await start(t);
  const admin = await (await request('/auth/login', 'POST', { email: user.email, password: ' contraseña de prueba ' })).json();
  assert.equal(admin.user.role, 'admin');
  const normal = await (await request('/auth/register', 'POST', { email: 'normal@example.com', password: 'password123' })).json();
  assert.equal((await request('/users')).status, 401);
  assert.equal((await request('/users', 'GET', undefined, normal.token)).status, 403);
  assert.equal((await request('/users/1', 'PATCH', { email: 'hacked@example.com' }, normal.token)).status, 403);
  assert.equal((await request('/users', 'GET', undefined, admin.token)).status, 200);
  assert.equal((await request('/auth/profile', 'PATCH', { displayName: 'Admin', bio: '', interestIds: ['1', '2'] }, admin.token)).status, 403);
});

test('registro limita intentos por IP', async t => {
  const request = await start(t);
  for (let i = 0; i < 10; i++) assert.equal((await request('/auth/register', 'POST', {})).status, 400);
  assert.equal((await request('/auth/register', 'POST', {})).status, 429);
});

test('CRUD devuelve rol, estado y perfil actualizado sin secretos; valida contraseñas y campos editables', async t => {
  const request = await start(t);
  const admin = await (await request('/auth/login', 'POST', { email: user.email, password: ' contraseña de prueba ' })).json();
  const normal = await (await request('/auth/register', 'POST', { email: 'perfil@example.com', password: 'password123' })).json();
  const profile = { displayName: 'Eduardo', bio: '', interestIds: ['1', '2'] };
  assert.equal((await request('/auth/profile', 'PATCH', profile, normal.token)).status, 200);
  const detail = await (await request(`/users/${normal.user.id}`, 'GET', undefined, admin.token)).json();
  assert.deepEqual(detail.user.profile, { ...profile, completed: true });
  assert.equal(detail.user.role, 'user');
  assert.equal(detail.user.status, 'active');
  assert.deepEqual(Object.keys(detail.user).sort(), ['createdAt', 'email', 'id', 'profile', 'role', 'status']);
  const list = await (await request('/users', 'GET', undefined, admin.token)).json();
  assert.deepEqual(list.users.find((value: { id: string }) => value.id === normal.user.id), detail.user);
  assert.equal(list.users.some((value: { id: string }) => value.id === '1'), false);
  const edited = await request(`/users/${normal.user.id}`, 'PATCH', { email: 'editado@example.com' }, admin.token);
  assert.deepEqual((await edited.json()).user, { ...detail.user, email: 'editado@example.com' });
  for (const password of ['short', 'a'.repeat(1025)]) {
    assert.equal((await request('/users', 'POST', { email: 'otra@example.com', password }, admin.token)).status, 400);
    assert.equal((await request(`/users/${normal.user.id}`, 'PATCH', { password }, admin.token)).status, 400);
  }
  for (const body of [{ role: 'admin' }, { status: 'suspended' }, { profile }]) {
    assert.equal((await request(`/users/${normal.user.id}`, 'PATCH', body, admin.token)).status, 400);
  }
  const created = await request('/users', 'POST', { email: 'otra@example.com', password: 'password123' }, admin.token);
  assert.equal(created.status, 201);
  const data = await created.json();
  assert.equal(data.user.role, 'user');
  assert.equal(data.user.profile.completed, false);
});
