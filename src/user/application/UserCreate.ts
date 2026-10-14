import { InvalidArgumentError } from '../../shared/domain/InvalidArgumentError.ts';
import type { UserRepository } from '../domain/UserRepository.ts';
import type { PasswordHasher } from '../domain/PasswordHasher.ts';
import { UserEmail } from '../domain/UserEmail.ts';
import { LoginPassword } from '../domain/LoginPassword.ts';
import { UserPasswordHash } from '../domain/UserPasswordHash.ts';

export class UserCreate {
  private readonly users: UserRepository;
  private readonly passwords: PasswordHasher;

  constructor(users: UserRepository, passwords: PasswordHasher) {
    this.users = users;
    this.passwords = passwords;
  }

  async execute(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).some(key => key !== 'email' && key !== 'password')) {
      throw new InvalidArgumentError('Envía únicamente email y password.');
    }
    const values = input as Record<string, unknown>;
    const email = new UserEmail(values.email);
    const password = new LoginPassword(values.password);
    const hash = new UserPasswordHash(await this.passwords.hash(password.value));
    // El repositorio genera id/createdAt y garantiza la unicidad, incluso bajo concurrencia.
    const user = await this.users.create(email, hash);
    return user.toDetails();
  }
}
