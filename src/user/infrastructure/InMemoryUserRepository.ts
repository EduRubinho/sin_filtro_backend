import type { ProfileInput, Category } from '../domain/UserProfile.ts';
import { InvalidArgumentError } from '../../shared/domain/InvalidArgumentError.ts';
import { AuthError } from '../domain/AuthError.ts';
import { User } from '../domain/User.ts';
import type { UserEmail } from '../domain/UserEmail.ts';
import type { UserId } from '../domain/UserId.ts';
import type { UserRepository, UserChanges } from '../domain/UserRepository.ts';
import type { UserPasswordHash } from '../domain/UserPasswordHash.ts';
import { UserAlreadyExistsError } from '../domain/UserAlreadyExistsError.ts';

export class InMemoryUserRepository implements UserRepository {
  private readonly users: Map<string, User>;
  private readonly categories: Category[] = [
    { id: '1', name: 'Deporte', slug: 'deporte' }, { id: '2', name: 'Música', slug: 'musica' },
    { id: '3', name: 'Café', slug: 'cafe' }, { id: '4', name: 'Arte', slug: 'arte' },
  ];
  private nextId = 1n;

  constructor(users: Iterable<User> = []) {
    this.users = new Map();
    const emails = new Set<string>();
    for (const user of users) {
      const email = user.email.toLookupValue();
      if (this.users.has(user.id.value) || emails.has(email)) {
        throw new Error('Usuario duplicado en el repositorio en memoria.');
      }
      this.users.set(user.id.value, user);
      emails.add(email);
      const id = BigInt(user.id.value);
      if (id >= this.nextId) this.nextId = id + 1n;
    }
  }

  async findCategories(): Promise<Category[]> { return this.categories.map(category => ({ ...category })); }

  async updateProfile(id: UserId, profile: ProfileInput): Promise<User | null> {
    const current = this.users.get(id.value);
    if (!current) return null;
    if (current.status !== 'active') throw new AuthError('UNAUTHORIZED');
    if (current.role.value !== 'user') throw new AuthError('FORBIDDEN');
    if (profile.interestIds.some(id => !this.categories.some(category => category.id === id))) {
      throw new InvalidArgumentError('Uno de los intereses ya no está disponible.');
    }
    const user = User.fromPrimitives({ id: id.value, email: current.email.value,
      passwordHash: current.passwordHash.value, createdAt: current.createdAt.value,
      role: current.role.value, status: current.status, ...profile, onboardingCompletedAt: new Date() });
    this.users.set(id.value, user);
    return user;
  }

  async findByEmail(email: UserEmail): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.email.toLookupValue() === email.toLookupValue()) return user;
    }
    return null;
  }

  async findById(id: UserId): Promise<User | null> {
    return this.users.get(id.value) ?? null;
  }

  async findAll(limit: number, offset: number): Promise<User[]> {
    return [...this.users.values()]
      .sort((a, b) => BigInt(a.id.value) < BigInt(b.id.value) ? -1 : 1)
      .slice(offset, offset + limit);
  }

  async create(email: UserEmail, passwordHash: UserPasswordHash): Promise<User> {
    this.ensureUniqueEmail(email);
    const user = User.fromPrimitives({
      id: String(this.nextId), email: email.toLookupValue(), passwordHash: passwordHash.value,
      createdAt: new Date(),
    });
    this.nextId += 1n;
    this.users.set(user.id.value, user);
    return user;
  }

  async update(id: UserId, changes: UserChanges): Promise<User | null> {
    const current = this.users.get(id.value);
    if (!current) return null;
    if (changes.email) this.ensureUniqueEmail(changes.email, id.value);
    const user = User.fromPrimitives({
      id: id.value, email: changes.email?.toLookupValue() ?? current.email.value,
      passwordHash: changes.passwordHash?.value ?? current.passwordHash.value,
      createdAt: current.createdAt.value, role: current.role.value, status: current.status,
      displayName: current.profile.displayName, bio: current.profile.bio, interestIds: current.profile.interestIds,
      onboardingCompletedAt: current.profile.completed ? new Date() : null,
    });
    this.users.set(id.value, user);
    return user;
  }

  async delete(id: UserId): Promise<boolean> {
    return this.users.delete(id.value);
  }

  private ensureUniqueEmail(email: UserEmail, exceptId?: string): void {
    for (const user of this.users.values()) {
      if (user.id.value !== exceptId && user.email.toLookupValue() === email.toLookupValue()) {
        throw new UserAlreadyExistsError();
      }
    }
  }
}
