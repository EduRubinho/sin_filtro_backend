import { InvalidArgumentError } from '../../shared/domain/InvalidArgumentError.ts';
import type { UserRepository } from '../domain/UserRepository.ts';
import { UserEmail } from '../domain/UserEmail.ts';
import { AuthError } from '../domain/AuthError.ts';
import { LoginPassword } from '../domain/LoginPassword.ts';
import type { PasswordVerifier } from '../domain/PasswordVerifier.ts';
import type { SessionRepository } from '../domain/SessionRepository.ts';

export class UserLogin {
  private readonly users: UserRepository;
  private readonly passwords: PasswordVerifier;
  private readonly sessions: SessionRepository;

  constructor(users: UserRepository, passwords: PasswordVerifier, sessions: SessionRepository) {
    this.users = users;
    this.passwords = passwords;
    this.sessions = sessions;
  }

  async execute(input: unknown) {
    if (!input || typeof input !== 'object') throw new AuthError('INVALID_INPUT');
    const values = input as Record<string, unknown>;
    let email: UserEmail;
    try {
      email = new UserEmail(values.email);
    } catch (error) {
      if (error instanceof InvalidArgumentError) throw new AuthError('INVALID_INPUT');
      throw error;
    }
    const password = new LoginPassword(values.password);
    const credentials = await this.users.findByEmail(email);
    // También verifica un hash ficticio si el correo no existe.
    const matches = await this.passwords.verify(password.value, credentials?.passwordHash.value ?? null);
    if (!credentials || !matches || credentials.status !== 'active') throw new AuthError('UNAUTHORIZED');
    return this.sessions.create(credentials);
  }
}
