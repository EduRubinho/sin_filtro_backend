import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { Client, Pool } from 'pg';
import { Router } from 'express';
import { createHttpApp } from '../../src/shared/infrastructure/HttpApp.ts';
import { ServiceContainer } from '../../src/shared/infrastructure/ServiceContainer.ts';
import { PostgresUserRepository } from '../../src/user/infrastructure/PostgresUserRepository.ts';
import { scryptPasswords } from '../../src/user/infrastructure/ScryptPasswords.ts';
import { memorySessions } from '../../src/user/infrastructure/InMemorySessionRepository.ts';
import { ExpressUserRouter } from '../../src/user/infrastructure/ExpressUserRouter.ts';
import { EventManagement } from '../../src/event/application/EventManagement.ts';
import { PostgresEventRepository } from '../../src/event/infrastructure/PostgresEventRepository.ts';
import { ExpressEventRouter } from '../../src/event/infrastructure/ExpressEventRouter.ts';

// Opt-in: crea y elimina SU PROPIA base temporal; nunca escribe en la base de DATABASE_URL.
test('CRUD administrativo real con PostgreSQL/PostGIS y permisos HTTP', { skip: process.env.RUN_POSTGRES_TESTS !== '1' }, async () => {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL para conectar al servidor de pruebas.');
  const dbName = `sinfiltro_test_${randomBytes(8).toString('hex')}`;
  const management = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${dbName}`;
  const pool = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
  let created = false;
  let server: ReturnType<ReturnType<typeof createHttpApp>['listen']> | undefined;
  try {
    await management.connect();
    await management.query(`CREATE DATABASE "${dbName}"`); created = true;
    await pool.query(await readFile(new URL('../../docs/database/schema.sql', import.meta.url), 'utf8'));
    const passwords = await scryptPasswords();
    const hash = await passwords.hash('password123');
    await pool.query("INSERT INTO public.users (email,password_hash,role) VALUES ('admin@example.com',$1,'admin'),('user@example.com',$1,'user'),('other@example.com',$1,'user')", [hash]);
    const users = new ServiceContainer(new PostgresUserRepository(pool), passwords, memorySessions()).user;
    const events = new EventManagement(new PostgresEventRepository(pool));
    server = createHttpApp(Router().use(ExpressEventRouter(events, users), ExpressUserRouter(users))).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const request = (path: string, method = 'GET', body?: unknown, token?: string) => fetch(`http://127.0.0.1:${address.port}${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const login = async (email: string) => {
      const res = await request('/auth/login', 'POST', { email, password: 'password123' });
      assert.equal(res.status, 200); return res.json();
    };
    const admin = await login('admin@example.com'), normal = await login('user@example.com');
    const userActivity = { categoryId: '1', title: 'Actividad del usuario', locationName: 'Tacna',
      latitude: -18.0066, longitude: -70.2463, startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString(), capacity: 8 };
    assert.equal((await request('/activities', 'POST', userActivity)).status, 401);
    assert.equal((await request('/activities', 'POST', userActivity, admin.token)).status, 403);
    assert.equal((await request('/activities', 'POST', { ...userActivity, organizerId: '3' }, normal.token)).status, 400);
    const publishedByUserResponse = await request('/activities', 'POST', userActivity, normal.token);
    assert.equal(publishedByUserResponse.status, 201);
    const publishedByUser = (await publishedByUserResponse.json()).event;
    assert.equal(publishedByUser.organizerId, '2');
    assert.equal(publishedByUser.status, 'published');
    assert.equal(publishedByUserResponse.headers.get('location'), `/activities/${publishedByUser.id}`);
    const userList = await (await request('/users?limit=1', 'GET', undefined, admin.token)).json();
    assert.equal(userList.users.length, 1);
    assert.equal(userList.users[0].role, 'user');
    assert.equal(userList.users[0].id, '2');
    assert.equal((await request('/users/1', 'GET', undefined, admin.token)).status, 404);
    assert.equal((await request('/users/1', 'PATCH', { email: 'hacked@example.com' }, admin.token)).status, 404);
    assert.equal((await request('/users/1', 'DELETE', undefined, admin.token)).status, 404);
    for (const root of ['/users', '/events']) {
      for (const [method, path] of [['GET', root], ['POST', root], ['GET', `${root}/1`], ['PATCH', `${root}/1`], ['DELETE', `${root}/1`]]) {
        assert.equal((await request(path, method, undefined)).status, 401);
        assert.equal((await request(path, method, method === 'GET' ? undefined : {}, normal.token)).status, 403);
      }
    }
    const input = { organizerId: '2', categoryId: '1', title: "Vóley ' prueba", locationName: 'Parque',
      latitude: -12.04, longitude: -77.03, startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString(), status: 'published', capacity: 5 };
    for (const change of [{ organizerId: '1' }, { organizerId: '99' }, { categoryId: '999' }, { latitude: 91 }]) {
      assert.equal((await request('/events', 'POST', { ...input, ...change }, admin.token)).status, 400);
    }
    assert.equal((await pool.query('SELECT count(*) FROM public.activities')).rows[0].count, '0');
    const res = await request('/events', 'POST', input, admin.token);
    assert.equal(res.status, 201);
    const { event } = await res.json();
    assert.equal(res.headers.get('location'), `/events/${event.id}`);
    assert.equal(event.organizerId, '2');
    assert.equal(event.longitude, input.longitude);
    assert.equal(event.latitude, input.latitude);
    // El mapa es una lectura autenticada independiente del CRUD administrativo.
    const mapUrl = '/activities/map?lat=-12.04&lng=-77.03&radiusMeters=500';
    assert.equal((await request(mapUrl)).status, 401);
    assert.equal((await request('/activities/map?lat=91&lng=0', 'GET', undefined, normal.token)).status, 400);
    assert.equal((await request('/activities/map?lat=1&lat=2&lng=0', 'GET', undefined, normal.token)).status, 400);
    const visible = await (await request(mapUrl, 'GET', undefined, normal.token)).json();
    assert.equal(visible.hasMore, false);
    assert.deepEqual(visible.activities.map((a: { id: string }) => a.id), [event.id]);
    assert.equal(visible.activities[0].latitude, input.latitude);
    assert.equal(visible.activities[0].longitude, input.longitude);
    assert.equal(visible.activities[0].categoryName, 'Deporte');
    assert.equal('organizerId' in visible.activities[0], false);
    for (const mode of ['draft', 'cancelled', 'completed', 'expired', 'deleted', 'far']) {
      const extraResponse = await request('/events', 'POST', { ...input, title: mode, status: mode === 'draft' ? 'draft' : 'published', latitude: mode === 'far' ? -13.04 : input.latitude }, admin.token);
      assert.equal(extraResponse.status, 201);
      const extra = (await extraResponse.json()).event;
      if (mode === 'cancelled') await pool.query("UPDATE public.activities SET status='cancelled' WHERE id=$1", [extra.id]);
      if (mode === 'completed') await pool.query("UPDATE public.activities SET starts_at=NOW()-interval '1 hour', completed_at=NOW(), status='completed' WHERE id=$1", [extra.id]);
      if (mode === 'expired') await pool.query("UPDATE public.activities SET starts_at=NOW()-interval '2 hours', ends_at=NOW()-interval '1 hour' WHERE id=$1", [extra.id]);
      if (mode === 'deleted') await request(`/events/${extra.id}`, 'DELETE', undefined, admin.token);
    }
    const filtered = await (await request(mapUrl, 'GET', undefined, normal.token)).json();
    assert.deepEqual(filtered.activities.map((a: { id: string }) => a.id), [event.id]);
    await pool.query("UPDATE public.activities SET starts_at=NOW()-interval '1 minute' WHERE id=$1", [event.id]);
    assert.equal((await (await request(mapUrl, 'GET', undefined, normal.token)).json()).activities[0].id, event.id);
    await pool.query('UPDATE public.activities SET starts_at=$2 WHERE id=$1', [event.id, input.startsAt]);
    const participants = await pool.query('SELECT user_id::text,attendance_validated_at FROM public.activity_participants WHERE activity_id=$1', [event.id]);
    assert.deepEqual(participants.rows, [{ user_id: '2', attendance_validated_at: null }]);
    const route = `/events/${event.id}`;
    const reloaded = (await (await request(route, 'GET', undefined, admin.token)).json()).event;
    assert.deepEqual(reloaded, { ...event, updatedAt: reloaded.updatedAt });
    assert.ok((await (await request('/events', 'GET', undefined, admin.token)).json()).events.some((item: { id: string }) => item.id === event.id));
    const edited = await request(route, 'PATCH', { title: 'Vóley editado', price: 12.50 }, admin.token);
    assert.equal(edited.status, 200);
    const updated = (await edited.json()).event;
    assert.equal(updated.price, 12.5); assert.equal(updated.locationName, input.locationName);
    assert.equal((await request(route, 'PATCH', { organizerId: '3' }, admin.token)).status, 400);
    assert.equal((await request(route, 'PATCH', { status: 'completed' }, admin.token)).status, 409);
    await pool.query('INSERT INTO public.activity_participants(activity_id,user_id) VALUES($1,3)', [event.id]);
    assert.equal((await request(route, 'PATCH', { title: 'NO GUARDAR', capacity: 1 }, admin.token)).status, 409);
    assert.equal((await (await request(route, 'GET', undefined, admin.token)).json()).event.title, 'Vóley editado');
    assert.equal((await request('/users/2', 'DELETE', undefined, admin.token)).status, 409);
    await pool.query("UPDATE public.activities SET starts_at=clock_timestamp()-interval '1 hour',ends_at=clock_timestamp()+interval '1 hour' WHERE id=$1", [event.id]);
    assert.equal((await request(route, 'PATCH', { latitude: 1 }, admin.token)).status, 409);
    assert.equal((await request(route, 'PATCH', { status: 'completed' }, admin.token)).status, 200);
    const completed = (await (await request(route, 'GET', undefined, admin.token)).json()).event;
    assert.ok(completed.completedAt);
    assert.equal((await request(route, 'PATCH', { status: 'published' }, admin.token)).status, 409);
    assert.equal((await request(route, 'DELETE', undefined, admin.token)).status, 204);
    assert.equal((await request(route, 'GET', undefined, admin.token)).status, 404);
    assert.equal((await request(route, 'DELETE', undefined, admin.token)).status, 404);
    assert.equal((await (await request(mapUrl, 'GET', undefined, normal.token)).json()).activities.length, 0);
    assert.ok((await pool.query('SELECT deleted_at FROM public.activities WHERE id=$1', [event.id])).rows[0].deleted_at);
    // Más de 100 resultados: límite explícito y aviso, sin devolver una lista ilimitada.
    await pool.query(`WITH inserted AS (
      INSERT INTO public.activities (organizer_id,category_id,title,location_name,location,starts_at,ends_at,status)
      SELECT 2,1,'Actividad '||n,'Parque',ST_SetSRID(ST_MakePoint(-77.03,-12.04),4326)::geography,
        NOW()+interval '1 day',NOW()+interval '2 days','published' FROM generate_series(1,101) n RETURNING id
    ) INSERT INTO public.activity_participants(activity_id,user_id) SELECT id,2 FROM inserted`);
    const bounded = await (await request(mapUrl, 'GET', undefined, normal.token)).json();
    assert.equal(bounded.activities.length, 100);
    assert.equal(bounded.hasMore, true);
    // Usuario sin relaciones: CRUD completo y revocación al cambiar contraseña.
    const added = await request('/users', 'POST', { email: 'new@example.com', password: 'password123' }, admin.token);
    assert.equal(added.status, 201); const addedUser = (await added.json()).user;
    const addedSession = await login('new@example.com');
    assert.equal((await request(`/users/${addedUser.id}`, 'PATCH', { password: 'updated123' }, admin.token)).status, 200);
    assert.equal((await request('/auth/me', 'GET', undefined, addedSession.token)).status, 401);
    assert.equal((await request(`/users/${addedUser.id}`, 'DELETE', undefined, admin.token)).status, 204);
    await pool.query("UPDATE public.users SET role='user' WHERE id=1");
    assert.equal((await request('/events', 'GET', undefined, admin.token)).status, 403);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); }
    await pool.end();
    if (created) await management.query(`DROP DATABASE "${dbName}"`);
    await management.end();
  }
});
