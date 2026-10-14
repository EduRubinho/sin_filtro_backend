import { User } from '../domain/User.ts';
import type { UserEmail } from '../domain/UserEmail.ts';
import type { UserId } from '../domain/UserId.ts';
import type { UserRepository, UserChanges } from '../domain/UserRepository.ts';
import type { UserPasswordHash } from '../domain/UserPasswordHash.ts';
import { UserAlreadyExistsError } from '../domain/UserAlreadyExistsError.ts';

export class InMemoryUserRepository implements UserRepository {
  private readonly users: Map<string, User>;
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
      createdAt: current.createdAt.value,
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
