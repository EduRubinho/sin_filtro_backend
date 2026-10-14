import type { User } from './User.ts';
import type { UserEmail } from './UserEmail.ts';
import type { UserId } from './UserId.ts';
import type { UserPasswordHash } from './UserPasswordHash.ts';

export interface UserChanges {
  email?: UserEmail;
  passwordHash?: UserPasswordHash;
}

export interface UserRepository {
  findAll(limit: number, offset: number): Promise<User[]>;
  findByEmail(email: UserEmail): Promise<User | null>;
  findById(id: UserId): Promise<User | null>;
  create(email: UserEmail, passwordHash: UserPasswordHash): Promise<User>;
  update(id: UserId, changes: UserChanges): Promise<User | null>;
  delete(id: UserId): Promise<boolean>;
}
