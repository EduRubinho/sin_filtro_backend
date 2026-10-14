import { SessionToken } from '../domain/SessionToken.ts';
import type { SessionRepository } from '../domain/SessionRepository.ts';

export class UserLogout {
  private readonly sessions: SessionRepository;

  constructor(sessions: SessionRepository) {
    this.sessions = sessions;
  }

  async execute(token: string): Promise<void> {
    await this.sessions.revoke(new SessionToken(token));
  }
}
