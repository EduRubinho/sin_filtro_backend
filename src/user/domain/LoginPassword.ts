import { AuthError } from './AuthError.ts';

export class LoginPassword {
  readonly #value: string;

  constructor(value: unknown) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 1024) {
      throw new AuthError('INVALID_INPUT');
    }
    // La contraseña se conserva exactamente y no se serializa como JSON.
    this.#value = value;
  }

  get value(): string {
    return this.#value;
  }
}
