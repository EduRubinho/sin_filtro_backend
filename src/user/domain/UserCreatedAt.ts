import { InvalidArgumentError } from '../../shared/domain/InvalidArgumentError.ts';

export class UserCreatedAt {
  readonly value: string;

  constructor(value: unknown) {
    if (!(value instanceof Date) && typeof value !== 'string') {
      throw new InvalidArgumentError('Fecha de creación inválida.');
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new InvalidArgumentError('Fecha de creación inválida.');
    this.value = date.toISOString();
  }
}
