import type { UserRepository } from '../domain/UserRepository.ts';
import type { SessionRepository } from '../domain/SessionRepository.ts';
import { authenticatedUser } from '../domain/AuthenticatedUser.ts';
export class UserGetCurrent {
  private readonly users: UserRepository;
  private readonly sessions: SessionRepository;
  constructor(users: UserRepository, sessions: SessionRepository) { this.users = users; this.sessions = sessions; }
  async execute(token: string) { return (await authenticatedUser(this.users, this.sessions, token)).toAuth(); }
}
