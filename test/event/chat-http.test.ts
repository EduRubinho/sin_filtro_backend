import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { Router } from 'express';
import { WebSocket } from 'ws';
import { ActivityChat } from '../../src/event/application/ActivityChat.ts';
import { EventManagement } from '../../src/event/application/EventManagement.ts';
import type { ChatMessage } from '../../src/event/domain/ActivityChat.ts';
import { ActivityChatRealtime } from '../../src/event/infrastructure/ActivityChatRealtime.ts';
import { ExpressEventRouter } from '../../src/event/infrastructure/ExpressEventRouter.ts';
import { createHttpApp } from '../../src/shared/infrastructure/HttpApp.ts';
import { ServiceContainer } from '../../src/shared/infrastructure/ServiceContainer.ts';
import { memorySessions } from '../../src/user/infrastructure/InMemorySessionRepository.ts';
import { ExpressUserRouter } from '../../src/user/infrastructure/ExpressUserRouter.ts';
import { User } from '../../src/user/domain/User.ts';
import { createUsers, passwords, user } from '../support/auth-fixture.ts';

const message: ChatMessage = { id: '9', activityId: '3', body: 'Nos vemos en la entrada', createdAt: '2027-01-01T12:00:00.000Z',
  sender: { id: '1', displayName: 'Edu', avatarUrl: null, isOrganizer: true } };
const info = { activityId: '3', activityTitle: 'Vóley', readOnly: false, availableUntil: '2027-01-02T12:00:00.000Z', unreadCount: 1 };

test('REST del chat usa sesión, pagina, envía, marca lectura y publica el mensaje', async (t) => {
  const users = new ServiceContainer(createUsers(), passwords, memorySessions()).user;
  let readMessageId = '', sentBody = '', broadcast: ChatMessage | null = null;
  const chats = {
    history: async () => ({ chat: info, messages: [message], hasMore: false }),
    send: async (_activityId: unknown, _userId: string, input: unknown) => { sentBody = (input as { body: string }).body; return message; },
    markRead: async (_activityId: unknown, _userId: string, id: unknown) => { readMessageId = String(id); },
  } as unknown as ActivityChat;
  const realtime = { async broadcast(value: ChatMessage) { broadcast = value; } };
  const app = createHttpApp(Router().use(ExpressEventRouter({} as EventManagement, users, chats, realtime), ExpressUserRouter(users)));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => { server.closeAllConnections(); server.close(); });
  await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: ' contraseña de prueba ' }) });
  const session = await login.json();
  const headers = { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${base}/activities/3/chat/messages`)).status, 401);
  const history = await fetch(`${base}/activities/3/chat/messages?limit=30`, { headers });
  assert.equal(history.status, 200); assert.deepEqual(await history.json(), { chat: info, messages: [message], hasMore: false });
  const sent = await fetch(`${base}/activities/3/chat/messages`, { method: 'POST', headers, body: JSON.stringify({ body: message.body }) });
  assert.equal(sent.status, 201); assert.equal(sentBody, message.body);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(broadcast, message);
  const read = await fetch(`${base}/activities/3/chat/read`, { method: 'POST', headers, body: JSON.stringify({ messageId: '9' }) });
  assert.equal(read.status, 204); assert.equal(readMessageId, '9');
});

test('WebSocket autentica, suscribe y entrega mensajes solo a miembros', async (t) => {
  const realtime = new ActivityChatRealtime();
  const server = createServer();
  const chats = { info: async () => info, activeMemberIds: async () => ['1'] } as unknown as ActivityChat;
  realtime.attach(server, async token => {
    if (token !== 'valid-token') throw new Error('invalid');
    return User.fromPrimitives(user).toAuth();
  }, chats);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
  const received: Record<string, unknown>[] = [];
  const waiters = new Map<string, (value: Record<string, unknown>) => void>();
  socket.on('message', raw => {
    const value = JSON.parse(raw.toString()) as Record<string, unknown>;
    const type = String(value.type); const waiter = waiters.get(type);
    if (waiter) { waiters.delete(type); waiter(value); } else received.push(value);
  });
  const waitFor = (type: string) => {
    const existing = received.findIndex(value => value.type === type);
    if (existing >= 0) return Promise.resolve(received.splice(existing, 1)[0]);
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout ${type}`)), 2000);
      waiters.set(type, value => { clearTimeout(timer); resolve(value); });
    });
  };
  t.after(() => { socket.close(); realtime.close(); server.close(); });
  await once(socket, 'open'); await waitFor('connected');
  socket.send(JSON.stringify({ type: 'authenticate', token: 'valid-token' })); await waitFor('authenticated');
  socket.send(JSON.stringify({ type: 'subscribe', activityId: '3' })); await waitFor('subscribed');
  const incoming = waitFor('message'); await realtime.broadcast(message);
  assert.deepEqual(await incoming, { type: 'message', activityId: '3', message });
});
