import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEventInput, createPublishedEventInput, patchEventInput, eventPagination, eventId, type Event } from '../../src/event/domain/Event.ts';
const now = Date.parse('2026-01-01T00:00:00Z');
const body = { organizerId: '2', categoryId: '1', title: 'Vóley', locationName: 'Parque', latitude: -12.04, longitude: -77.03,
  startsAt: '2026-02-01T17:00:00-05:00', endsAt: '2026-02-01T19:00:00-05:00' };
const event: Event = { ...createEventInput(body, now), id: '1', createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), completedAt: null };
test('evento valida fechas, coordenadas, dinero, estado y campos de solo lectura', () => {
  assert.equal(event.startsAt, '2026-02-01T22:00:00.000Z');
  assert.equal(event.status, 'draft');
  for (const changes of [{ latitude: 91 }, { longitude: -181 }, { latitude: '12' }, { price: -1 }, { price: 2.005 },
    { capacity: 0 }, { capacity: 1.5 }, { organizerId: 2 }, { title: '  ' }, { categoryId: '0' }, { timeZone: 'nope' },
    { startsAt: '2026-02-30T17:00:00Z' }, { endsAt: body.startsAt }, { startsAt: '2020-01-01T00:00:00Z' },
    { startsAt: '2026-02-01 17:00' }, { id: '9' }, { deletedAt: 'today' }, { status: 'completed' }]) {
    assert.throws(() => createEventInput({ ...body, ...changes }, now), { code: 'INVALID_INPUT' }, JSON.stringify(changes));
  }
});
test('PATCH conserva campos omitidos, impide cambiar organizador y reabrir eventos', () => {
  assert.equal(patchEventInput(event, { title: 'Otro título' }, now).locationName, event.locationName);
  assert.throws(() => patchEventInput(event, { organizerId: '3' }, now), { code: 'INVALID_INPUT' });
  assert.throws(() => patchEventInput(event, {}, now), { code: 'INVALID_INPUT' });
  assert.throws(() => patchEventInput(event, { status: 'completed' }, now), { code: 'CONFLICT' });
  const published = { ...event, status: 'published' as const };
  assert.throws(() => patchEventInput(published, { status: 'draft' }, now), { code: 'CONFLICT' });
  const later = Date.parse(event.endsAt) + 1000;
  assert.equal(patchEventInput(published, { status: 'completed' }, later).status, 'completed');
  assert.throws(() => patchEventInput(published, { longitude: 1 }, later), { code: 'CONFLICT' });
  assert.throws(() => patchEventInput({ ...event, status: 'completed' }, { status: 'published' }, later), { code: 'CONFLICT' });
  assert.throws(() => patchEventInput({ ...event, status: 'cancelled' }, { startsAt: '2027-01-01T00:00:00Z' }, now));
});
test('publicación de usuario obtiene organizador y estado de la sesión', () => {
  const { organizerId: _organizerId, ...withoutOrganizer } = body;
  const published = createPublishedEventInput(withoutOrganizer, '7', now);
  assert.equal(published.organizerId, '7');
  assert.equal(published.status, 'published');
  assert.throws(() => createPublishedEventInput({ ...withoutOrganizer, organizerId: '9' }, '7', now), { code: 'INVALID_INPUT' });
  assert.throws(() => createPublishedEventInput({ ...withoutOrganizer, status: 'draft' }, '7', now), { code: 'INVALID_INPUT' });
});
test('IDs y paginación no aceptan arrays, inyección ni límites excesivos', () => {
  assert.deepEqual(eventPagination(), { limit: 50, offset: 0 });
  for (const value of ['0', '-1', '101', ['1'], '1 OR 1=1']) assert.throws(() => eventPagination(value));
  for (const value of ['0', '9223372036854775808', ['1'], 1]) assert.throws(() => eventId(value));
});
