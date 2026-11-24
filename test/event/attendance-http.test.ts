import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { Router } from 'express';
import { ActivityAttendance } from '../../src/event/application/ActivityAttendance.ts';
import type { EventManagement } from '../../src/event/application/EventManagement.ts';
import { ExpressEventRouter } from '../../src/event/infrastructure/ExpressEventRouter.ts';
import { createHttpApp } from '../../src/shared/infrastructure/HttpApp.ts';
import { ServiceContainer } from '../../src/shared/infrastructure/ServiceContainer.ts';
import { memorySessions } from '../../src/user/infrastructure/InMemorySessionRepository.ts';
import { InMemoryUserRepository } from '../../src/user/infrastructure/InMemoryUserRepository.ts';
import { ExpressUserRouter } from '../../src/user/infrastructure/ExpressUserRouter.ts';
import { User } from '../../src/user/domain/User.ts';
import { passwords, user } from '../support/auth-fixture.ts';

test('HTTP asistencia exige sesión user, usa su identidad, valida el PIN y no almacena respuestas en caché', async t => {
  const users = new ServiceContainer(new InMemoryUserRepository([
    User.fromPrimitives(user), User.fromPrimitives({ ...user, id: '2', email: 'admin@test.com', role: 'admin' }),
  ]), passwords, memorySessions()).user;
  let actor = '', receivedPin = '', revoked = false;
  const attendance = new ActivityAttendance({
    async info(_id, userId) { actor = userId; return { opensAt: '2027-01-01T12:00:00Z', closesAt: '2027-01-01T13:00:00Z', open: true, isOrganizer: false,
      validatedAt: null, lockedUntil: null, codeExpiresAt: null, enrolled: 1, confirmed: 0, pending: 1, participants: [] }; },
    async issue(_id, userId) { actor = userId; return { pin: '001234', expiresAt: '2027-01-01T12:15:00Z' }; },
    async revoke() { revoked = true; },
    async validate(_id, userId, pin) { actor = userId; receivedPin = pin; return { validatedAt: '2027-01-01T12:01:00Z' }; },
  });
  const server = createHttpApp(Router().use(ExpressEventRouter({} as EventManagement, users, undefined, undefined, attendance), ExpressUserRouter(users))).listen(0, '127.0.0.1');
  t.after(() => { server.closeAllConnections(); server.close(); }); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const request = (path: string, method = 'GET', token?: string, body?: unknown) => fetch(`http://127.0.0.1:${address.port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const login = async (email: string) => (await (await request('/auth/login', 'POST', undefined, { email, password: ' contraseña de prueba ' })).json()).token as string;
  const token = await login(user.email), adminToken = await login('admin@test.com');
  const path = '/activities/3/attendance';
  assert.equal((await request(path)).status, 401);
  for (const [suffix, method] of [['', 'GET'], ['/pin', 'POST'], ['/pin', 'DELETE'], ['/validate', 'POST']]) {
    assert.equal((await request(path + suffix, method, adminToken, method === 'POST' ? { pin: '001234' } : undefined)).status, 403);
  }
  const info = await request(path, 'GET', token); assert.equal(info.status, 200); assert.equal(info.headers.get('cache-control'), 'no-store');
  assert.ok(!('pin' in await info.json())); assert.equal(actor, '1');
  const issued = await request(path + '/pin', 'POST', token); assert.equal(issued.status, 201); assert.equal((await issued.json()).pin, '001234');
  assert.equal((await request(path + '/validate', 'POST', token, { pin: '001234', userId: '2' })).status, 400);
  assert.equal((await request(path + '/validate', 'POST', token, { pin: '001234' })).status, 200);
  assert.equal(receivedPin, '001234'); assert.equal(actor, '1');
  assert.equal((await request(path + '/pin', 'DELETE', token)).status, 204); assert.ok(revoked);
});
