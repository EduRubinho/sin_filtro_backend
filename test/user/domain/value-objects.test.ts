import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LoginPassword } from '../../../src/user/domain/LoginPassword.ts';
import { SessionToken } from '../../../src/user/domain/SessionToken.ts';

test('contraseña conserva espacios y acepta entre 8 y 64 caracteres sin serializar el secreto', () => {
  const password = new LoginPassword(' contraseña ');
  assert.equal(password.value, ' contraseña ');
  assert.equal(JSON.stringify(password), '{}');
  assert.equal(new LoginPassword('a'.repeat(8)).value.length, 8);
  assert.equal(new LoginPassword('a'.repeat(64)).value.length, 64);
  for (const value of [null, 1, '', 'a'.repeat(7), 'a'.repeat(65)]) {
    assert.throws(() => new LoginPassword(value), { code: 'INVALID_INPUT' });
  }
});

test('token acepta únicamente el formato opaco existente', () => {
  const value = 'a'.repeat(41) + '_-';
  assert.equal(new SessionToken(value).value, value);
  assert.equal(JSON.stringify(new SessionToken(value)), '{}');
  for (const token of [null, '', 'a'.repeat(42), 'a'.repeat(44), 'a'.repeat(42) + '+']) {
    assert.throws(() => new SessionToken(token), { code: 'UNAUTHORIZED' });
  }
});
