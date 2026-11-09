import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { Router } from 'express';
import { EventManagement } from '../../src/event/application/EventManagement.ts';
import { ExpressEventRouter } from '../../src/event/infrastructure/ExpressEventRouter.ts';
import { createHttpApp } from '../../src/shared/infrastructure/HttpApp.ts';
import { ServiceContainer } from '../../src/shared/infrastructure/ServiceContainer.ts';
import { memorySessions } from '../../src/user/infrastructure/InMemorySessionRepository.ts';
import { ExpressUserRouter } from '../../src/user/infrastructure/ExpressUserRouter.ts';
import { createUsers, passwords, user } from '../support/auth-fixture.ts';

test('GET /activities/mine usa la identidad de la sesión y no se interpreta como un ID', async (t) => {
  const users = new ServiceContainer(createUsers(), passwords, memorySessions()).user;
  let receivedUserId = '';
  const plans = { organized: [{ id: '8', title: 'Café', locationName: 'Centro', categoryName: 'Café',
    startsAt: '2027-02-01T12:00:00.000Z', endsAt: '2027-02-01T14:00:00.000Z', status: 'published',
    capacity: 6, participantCount: 2, relation: 'organizer' }], participating: [] };
  const events = { plans(userId: string) { receivedUserId = userId; return Promise.resolve(plans); } } as unknown as EventManagement;
  const app = createHttpApp(Router().use(ExpressEventRouter(events, users), ExpressUserRouter(users)));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => { server.closeAllConnections(); server.close(); });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: ' contraseña de prueba ' }) });
  const session = await login.json();
  const response = await fetch(`${base}/activities/mine`, { headers: { Authorization: `Bearer ${session.token}` } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), plans);
  assert.equal(receivedUserId, user.id);
  assert.equal((await fetch(`${base}/activities/mine`)).status, 401);
});
