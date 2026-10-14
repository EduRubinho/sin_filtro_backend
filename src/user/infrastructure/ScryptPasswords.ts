import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { PasswordVerifier } from '../domain/PasswordVerifier.ts';
import type { PasswordHasher } from '../domain/PasswordHasher.ts';

// Perfil scrypt de OWASP: N=2^15, r=8, p=3. No agrega librerías nativas.
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const prefix = 'scrypt$32768$8$3';

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, options, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `${prefix}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function scryptPasswords(): Promise<PasswordVerifier & PasswordHasher> {
  const dummy = await hashPassword(randomBytes(32).toString('hex'));
  return {
    hash: hashPassword,
    async verify(password, hash) {
      const supported = typeof hash === 'string' && /^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash);
      const parts = (supported ? hash : dummy).split('$');
      const actual = await derive(password, Buffer.from(parts[4], 'hex'));
      const matches = timingSafeEqual(actual, Buffer.from(parts[5], 'hex'));
      return supported && matches;
    },
  };
}
