import type { UserRepository } from '../domain/UserRepository.ts';
import type { SessionRepository } from '../domain/SessionRepository.ts';
import { authenticatedUser } from '../domain/AuthenticatedUser.ts';
import { validateProfile } from '../domain/UserProfile.ts';
import { AuthError } from '../domain/AuthError.ts';

export class UserUpdateProfile {
  private readonly users: UserRepository;
  private readonly sessions: SessionRepository;
  constructor(users: UserRepository, sessions: SessionRepository) { this.users = users; this.sessions = sessions; }
  async execute(token: string, input: unknown) {
    const current = await authenticatedUser(this.users, this.sessions, token);
    if (current.role.value !== 'user') throw new AuthError('FORBIDDEN');
    const profile = validateProfile(input);
    const user = await this.users.updateProfile(current.id, profile);
    if (!user) throw new AuthError('UNAUTHORIZED');
    return user.toAuth();
  }
}
