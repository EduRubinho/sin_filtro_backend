import { InvalidArgumentError } from '../../shared/domain/InvalidArgumentError.ts';
import type { UserRepository } from '../domain/UserRepository.ts';

export class UserGetAll {
  private readonly users: UserRepository;

  constructor(users: UserRepository) {
    this.users = users;
  }

  async execute(limit: number = 50, offset: number = 0) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
        !Number.isSafeInteger(offset) || offset < 0) {
      throw new InvalidArgumentError('limit debe estar entre 1 y 100; offset debe ser un entero no negativo.');
    }
    const users = await this.users.findAll(limit, offset);
    return users.map(user => user.toDetails());
  }
}
