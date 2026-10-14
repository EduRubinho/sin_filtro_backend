import { InMemoryUserRepository } from '../../src/user/infrastructure/InMemoryUserRepository.ts';
import { User } from '../../src/user/domain/User.ts';
import type { UserRepository } from '../../src/user/domain/UserRepository.ts';
import { hashPassword, scryptPasswords } from '../../src/user/infrastructure/ScryptPasswords.ts';

export const hash = await hashPassword(' contraseña de prueba ');
export const passwords = await scryptPasswords();
export const user = { id: '1', email: 'edu@example.com', passwordHash: hash, createdAt: '2026-01-01T00:00:00.000Z' };
export function createUsers(overrides: Partial<UserRepository> = {}) {
  return Object.assign(new InMemoryUserRepository([User.fromPrimitives(user)]), overrides);
}
export const users = createUsers();
