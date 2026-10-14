import { InvalidArgumentError } from '../../shared/domain/InvalidArgumentError.ts';

export class UserPasswordHash {
  readonly #value: string;

  constructor(value: unknown) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new InvalidArgumentError('Hash de contraseña inválido.');
    }
    // El algoritmo lo interpreta PasswordVerifier, no la entidad.
    this.#value = value;
  }

  get value(): string {
    return this.#value;
  }
}
