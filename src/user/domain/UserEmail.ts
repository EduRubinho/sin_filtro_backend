import { InvalidArgumentError } from '../../shared/domain/InvalidArgumentError.ts';

export class UserEmail {
  readonly value: string;

  constructor(value: unknown) {
    if (typeof value !== 'string' || value.trim().length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
      throw new InvalidArgumentError('Correo de usuario inválido.');
    }
    // Conserva la representación almacenada al responder con el usuario.
    this.value = value;
  }

  toLookupValue(): string {
    return this.value.trim().toLowerCase();
  }
}
