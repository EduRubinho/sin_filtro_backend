import type { UserRepository } from '../domain/UserRepository.ts';
import type { SessionRepository } from '../domain/SessionRepository.ts';
import { UserId } from '../domain/UserId.ts';
import { UserNotFoundError } from '../domain/UserNotFoundError.ts';

export class UserDelete {
  private readonly users: UserRepository;
  private readonly sessions: SessionRepository;

  constructor(users: UserRepository, sessions: SessionRepository) {
    this.users = users;
    this.sessions = sessions;
  }

  async execute(value: unknown): Promise<void> {
    const id = new UserId(value);
    if (!await this.users.delete(id)) throw new UserNotFoundError();
    await this.sessions.revokeByUserId(id);
  }
}
