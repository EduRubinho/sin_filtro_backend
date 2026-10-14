import { AuthError } from './AuthError.ts';

export class SessionToken {
  readonly #value: string;

  constructor(value: unknown) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
      throw new AuthError('UNAUTHORIZED');
    }
    this.#value = value;
  }

  get value(): string {
    return this.#value;
  }
}
