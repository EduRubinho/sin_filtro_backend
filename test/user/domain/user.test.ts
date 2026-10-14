import assert from 'node:assert/strict';
import { test } from 'node:test';
import { User } from '../../../src/user/domain/User.ts';
import { UserEmail } from '../../../src/user/domain/UserEmail.ts';
import { UserId } from '../../../src/user/domain/UserId.ts';
import { UserPasswordHash } from '../../../src/user/domain/UserPasswordHash.ts';
import { UserCreatedAt } from '../../../src/user/domain/UserCreatedAt.ts';

test('correo valida límites y normaliza la búsqueda conservando su representación', () => {
  const email = new UserEmail(' EDU@EXAMPLE.COM ');
  assert.equal(email.toLookupValue(), 'edu@example.com');
  assert.equal(email.value, ' EDU@EXAMPLE.COM ');
  assert.equal(new UserEmail(`${'a'.repeat(242)}@example.com`).value.length, 254);
  for (const value of [null, 1, '', 'invalid', 'a b@example.com', `${'a'.repeat(243)}@example.com`]) {
    assert.throws(() => new UserEmail(value), { code: 'INVALID_INPUT' });
  }
});

test('usuario serializa solo datos públicos y conserva IDs BIGINT sin perder precisión', () => {
  const row = { id: '9223372036854775807', email: 'Edu@example.com', passwordHash: 'secret', createdAt: '2026-01-01T00:00:00Z' };
  const user = User.fromPrimitives(row);
  assert.deepEqual(user.toPrimitives(), { id: row.id, email: row.email });
  assert.equal(JSON.stringify(user).includes('secret'), false);
  assert.equal(user.passwordHash.value, row.passwordHash);
  assert.equal(user.createdAt.value, '2026-01-01T00:00:00.000Z');
  assert.equal(new UserId('1').value, '1');
  for (const value of [null, 1, '', '   ']) assert.throws(() => new UserId(value));
});

test('hash y fecha de creación validan los atributos persistidos', () => {
  const hash = new UserPasswordHash('stored-hash');
  assert.equal(hash.value, 'stored-hash');
  assert.equal(JSON.stringify(hash), '{}');
  for (const value of [null, 1, '']) assert.throws(() => new UserPasswordHash(value));
  const date = new Date('2026-01-01T12:00:00Z');
  const createdAt = new UserCreatedAt(date);
  date.setUTCFullYear(2020);
  assert.equal(createdAt.value, '2026-01-01T12:00:00.000Z');
  for (const value of [null, 1, '', 'invalid', new Date(NaN)]) {
    assert.throws(() => new UserCreatedAt(value));
  }
});
