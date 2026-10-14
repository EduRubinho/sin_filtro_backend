import type { UserRepository } from '../domain/UserRepository.ts';
import { UserId } from '../domain/UserId.ts';
import { UserNotFoundError } from '../domain/UserNotFoundError.ts';

export class UserGetOneById {
  private readonly users: UserRepository;

  constructor(users: UserRepository) {
    this.users = users;
  }

  async execute(value: unknown) {
    const user = await this.users.findById(new UserId(value));
    if (!user) throw new UserNotFoundError();
    return user.toDetails();
  }
}
