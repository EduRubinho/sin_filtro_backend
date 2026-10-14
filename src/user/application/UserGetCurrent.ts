import type { UserRepository } from '../domain/UserRepository.ts';
import { UserId } from '../domain/UserId.ts';
import { AuthError } from '../domain/AuthError.ts';
import { SessionToken } from '../domain/SessionToken.ts';
import type { SessionRepository } from '../domain/SessionRepository.ts';

export class UserGetCurrent {
  private readonly users: UserRepository;
  private readonly sessions: SessionRepository;

  constructor(users: UserRepository, sessions: SessionRepository) {
    this.users = users;
    this.sessions = sessions;
  }

  async execute(value: string) {
    const token = new SessionToken(value);
    const session = await this.sessions.find(token);
    if (!session) throw new AuthError('UNAUTHORIZED');
    const user = await this.users.findById(new UserId(session.user.id));
    if (!user) {
      await this.sessions.revoke(token);
      throw new AuthError('UNAUTHORIZED');
    }
    return user.toPrimitives();
  }
}
