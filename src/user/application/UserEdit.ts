import { InvalidArgumentError } from '../../shared/domain/InvalidArgumentError.ts';
import type { UserRepository, UserChanges } from '../domain/UserRepository.ts';
import type { PasswordHasher } from '../domain/PasswordHasher.ts';
import type { SessionRepository } from '../domain/SessionRepository.ts';
import { UserId } from '../domain/UserId.ts';
import { UserEmail } from '../domain/UserEmail.ts';
import { NewPassword } from '../domain/NewPassword.ts';
import { UserPasswordHash } from '../domain/UserPasswordHash.ts';
import { UserNotFoundError } from '../domain/UserNotFoundError.ts';

export class UserEdit {
  private readonly users: UserRepository;
  private readonly passwords: PasswordHasher;
  private readonly sessions: SessionRepository;

  constructor(users: UserRepository, passwords: PasswordHasher, sessions: SessionRepository) {
    this.users = users;
    this.passwords = passwords;
    this.sessions = sessions;
  }

  async execute(value: unknown, input: unknown) {
    const id = new UserId(value);
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length === 0 ||
        Object.keys(input).some(key => key !== 'email' && key !== 'password')) {
      throw new InvalidArgumentError('Envía email y/o password para actualizar el usuario.');
    }
    const values = input as Record<string, unknown>;
    const changes: UserChanges = {};
    if ('email' in values) changes.email = new UserEmail(values.email);
    if ('password' in values) {
      const password = new NewPassword(values.password);
      changes.passwordHash = new UserPasswordHash(await this.passwords.hash(password.value));
    }
    // Actualiza solo las columnas enviadas, sin sobrescribir cambios concurrentes en otras columnas.
    const user = await this.users.update(id, changes);
    if (!user) throw new UserNotFoundError();
    if (changes.passwordHash) await this.sessions.revokeByUserId(id);
    return user.toDetails();
  }
}
