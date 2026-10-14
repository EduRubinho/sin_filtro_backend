import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readEnv } from '../../../src/shared/infrastructure/Env.ts';

const env = {
  DATABASE_URL: 'postgres://localhost/test',
};

test('configuración solo requiere la conexión general y usa el puerto predeterminado', () => {
  assert.deepEqual(readEnv(env), {
    port: 3000,
    databaseUrl: env.DATABASE_URL,
  });
  assert.equal(readEnv({ ...env, PORT: '4000' }).port, 4000);
});

test('configuración rechaza campos ausentes y puertos inválidos antes del arranque', () => {
  for (const name of Object.keys(env)) {
    assert.throws(() => readEnv({ ...env, [name]: '' }), new RegExp(name));
  }
  for (const port of ['0', '65536', 'abc', '1.5']) {
    assert.throws(() => readEnv({ ...env, PORT: port }), /PORT inválido/);
  }
});
