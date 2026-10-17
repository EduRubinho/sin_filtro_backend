import type { UserRepository } from './UserRepository.ts';
import type { SessionRepository } from './SessionRepository.ts';
import { UserId } from './UserId.ts';
import { SessionToken } from './SessionToken.ts';
import { AuthError } from './AuthError.ts';

// Política compartida: el rol/estado vigente se lee de la cuenta, no de la sesión almacenada.
export async function authenticatedUser(users: UserRepository, sessions: SessionRepository, value: string) {
  const token = new SessionToken(value);
  const session = await sessions.find(token);
  if (!session) throw new AuthError('UNAUTHORIZED');
  const user = await users.findById(new UserId(session.user.id));
  if (!user || user.status !== 'active') {
    await sessions.revoke(token);
    throw new AuthError('UNAUTHORIZED');
  }
  return user;
}
