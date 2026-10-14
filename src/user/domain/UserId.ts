import { InvalidArgumentError } from '../../shared/domain/InvalidArgumentError.ts';

export class UserId {
  readonly value: string;

  constructor(value: unknown) {
    if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) {
      throw new InvalidArgumentError('Identificador de usuario inválido.');
    }
    // PostgreSQL devuelve BIGINT como texto; no convertir a number ni exigir UUID.
    this.value = value;
  }
}
