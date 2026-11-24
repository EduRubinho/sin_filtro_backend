import type { UserRepository } from '../domain/UserRepository.ts';
import { UserId } from '../domain/UserId.ts';
import { UserNotFoundError } from '../domain/UserNotFoundError.ts';

/** Lista explícita de campos visibles: nunca devuelve correo, hash ni sesión. */
export class UserGetPublicProfile {
  private readonly users: UserRepository;
  constructor(users: UserRepository) { this.users = users; }
  async execute(value: unknown) {
    const user = await this.users.findById(new UserId(value));
    if (!user || user.role.value !== 'user' || user.status !== 'active') throw new UserNotFoundError();
    const categories = await this.users.findCategories();
    return { id: user.id.value, displayName: user.profile.displayName || 'Usuario', bio: user.profile.bio,
      interests: categories.filter(c => user.profile.interestIds.includes(c.id)).map(c => ({ id: c.id, name: c.name })) };
  }
}
