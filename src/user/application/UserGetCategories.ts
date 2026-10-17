import type { UserRepository } from '../domain/UserRepository.ts';
export class UserGetCategories {
  private readonly users: UserRepository;
  constructor(users: UserRepository) { this.users = users; }
  execute() { return this.users.findCategories(); }
}
