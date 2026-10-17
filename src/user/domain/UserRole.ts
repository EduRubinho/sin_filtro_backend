import { InvalidArgumentError } from '../../shared/domain/InvalidArgumentError.ts';
export class UserRole {
  readonly value: 'user' | 'admin';
  constructor(value: unknown = 'user') {
    if (value !== 'user' && value !== 'admin') throw new InvalidArgumentError('Rol inválido.');
    this.value = value;
  }
}
