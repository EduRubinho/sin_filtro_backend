import { UserEmail } from './UserEmail.ts';
import { UserId } from './UserId.ts';
import { UserPasswordHash } from './UserPasswordHash.ts';
import { UserCreatedAt } from './UserCreatedAt.ts';

// Contrato público actual de /auth: nunca incluye el hash.
export interface UserPrimitives {
  id: string;
  email: string;
}

export interface UserRecord extends UserPrimitives {
  passwordHash: string;
  createdAt: string | Date;
}

export class User {
  readonly id: UserId;
  readonly email: UserEmail;
  readonly passwordHash: UserPasswordHash;
  readonly createdAt: UserCreatedAt;

  constructor(id: UserId, email: UserEmail, passwordHash: UserPasswordHash, createdAt: UserCreatedAt) {
    this.id = id;
    this.email = email;
    this.passwordHash = passwordHash;
    this.createdAt = createdAt;
  }

  static fromPrimitives(value: UserRecord): User {
    return new User(new UserId(value.id), new UserEmail(value.email),
      new UserPasswordHash(value.passwordHash), new UserCreatedAt(value.createdAt));
  }

  toPrimitives(): UserPrimitives {
    return { id: this.id.value, email: this.email.value };
  }

  toJSON(): UserPrimitives {
    return this.toPrimitives();
  }

  toDetails() {
    return { ...this.toPrimitives(), createdAt: this.createdAt.value };
  }
}
