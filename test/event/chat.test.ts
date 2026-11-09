import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chatBody, chatMessageId, chatPagination } from '../../src/event/domain/ActivityChat.ts';

test('chat valida texto, paginación e IDs sin aceptar campos adicionales', () => {
  assert.equal(chatBody({ body: '  Nos vemos  ' }), 'Nos vemos');
  assert.deepEqual(chatPagination({}), { beforeId: null, limit: 30 });
  assert.deepEqual(chatPagination({ beforeId: '10', limit: '20' }), { beforeId: '10', limit: 20 });
  assert.equal(chatMessageId('9223372036854775807'), '9223372036854775807');
  for (const value of [{ body: '' }, { body: 'a', extra: true }, { body: 'a'.repeat(1001) }, null]) assert.throws(() => chatBody(value));
  for (const query of [{ limit: '0' }, { limit: '51' }, { beforeId: '0' }, { unknown: '1' }]) assert.throws(() => chatPagination(query));
});
