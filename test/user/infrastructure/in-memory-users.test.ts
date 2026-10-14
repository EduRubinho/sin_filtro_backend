import assert from 'node:assert/strict';
import { test } from 'node:test';
import { User } from '../../../src/user/domain/User.ts';
import { UserEmail } from '../../../src/user/domain/UserEmail.ts';
import { UserId } from '../../../src/user/domain/UserId.ts';
import { UserPasswordHash } from '../../../src/user/domain/UserPasswordHash.ts';
import { InMemoryUserRepository } from '../../../src/user/infrastructure/InMemoryUserRepository.ts';

const record = { id: '9223372036854775807', email: 'Edu@example.com', passwordHash: 'stored-hash', createdAt: '2026-01-01T00:00:00Z' };

test('repositorio en memoria conserva los cuatro atributos y el contrato de búsquedas', async () => {
  const repository = new InMemoryUserRepository([User.fromPrimitives(record)]);
  const user = await repository.findByEmail(new UserEmail(' EDU@EXAMPLE.COM '));
  assert.equal(user?.id.value, record.id);
  assert.equal(user?.passwordHash.value, record.passwordHash);
  assert.equal(user?.createdAt.value, '2026-01-01T00:00:00.000Z');
  assert.equal(await repository.findById(new UserId(record.id)), user);
  assert.equal(await repository.findById(new UserId('999')), null);
  assert.equal(await repository.findByEmail(new UserEmail('missing@example.com')), null);
});

test('memoria pagina por ID numérico, no reutiliza IDs y evita duplicados concurrentes', async () => {
  const repository = new InMemoryUserRepository([
    User.fromPrimitives({ ...record, id: '10', email: 'ten@example.com' }),
    User.fromPrimitives({ ...record, id: '2', email: 'two@example.com' }),
  ]);
  assert.deepEqual((await repository.findAll(1, 1)).map(user => user.id.value), ['10']);
  const results = await Promise.allSettled([
    repository.create(new UserEmail('same@example.com'), new UserPasswordHash('hash')),
    repository.create(new UserEmail('SAME@example.com'), new UserPasswordHash('hash')),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const conflict = results.find(result => result.status === 'rejected');
  assert.ok(conflict && conflict.status === 'rejected');
  assert.equal(conflict.reason.code, 'EMAIL_ALREADY_EXISTS');
  const created = await repository.findByEmail(new UserEmail('same@example.com'));
  assert.equal(created?.id.value, '11');
  await repository.delete(new UserId('11'));
  const next = await repository.create(new UserEmail('next@example.com'), new UserPasswordHash('hash'));
  assert.equal(next.id.value, '12');
});

test('repositorio en memoria rechaza IDs y correos duplicados como PostgreSQL', () => {
  const original = User.fromPrimitives(record);
  assert.throws(() => new InMemoryUserRepository([original, original]), /duplicado/);
  assert.throws(() => new InMemoryUserRepository([
    original, User.fromPrimitives({ ...record, id: '2', email: 'EDU@example.com' }),
  ]), /duplicado/);
});
