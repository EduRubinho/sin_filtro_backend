import { InvalidArgumentError } from '../../shared/domain/InvalidArgumentError.ts';
import type { UserRepository } from '../domain/UserRepository.ts';
import type { PasswordHasher } from '../domain/PasswordHasher.ts';
import type { SessionRepository } from '../domain/SessionRepository.ts';
import { UserEmail } from '../domain/UserEmail.ts';
import { NewPassword } from '../domain/NewPassword.ts';
import { UserPasswordHash } from '../domain/UserPasswordHash.ts';

export class UserRegister {
  private readonly users: UserRepository;
  private readonly passwords: PasswordHasher;
  private readonly sessions: SessionRepository;
  constructor(users: UserRepository, passwords: PasswordHasher, sessions: SessionRepository) {
    this.users = users; this.passwords = passwords; this.sessions = sessions;
  }
  async execute(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).some(key => !['email', 'password'].includes(key))) {
      throw new InvalidArgumentError('Envía únicamente email y password.');
    }
    const values = input as Record<string, unknown>;
    const email = new UserEmail(values.email);
    const password = new NewPassword(values.password);
    const hash = new UserPasswordHash(await this.passwords.hash(password.value));
    // El repositorio crea exclusivamente role=user; no admite rol desde la petición.
    const user = await this.users.create(email, hash);
    return this.sessions.create(user);
  }
}
