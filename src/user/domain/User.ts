import { UserEmail } from './UserEmail.ts';
import { UserId } from './UserId.ts';
import { UserPasswordHash } from './UserPasswordHash.ts';
import { UserRole } from './UserRole.ts';
import type { Profile } from './UserProfile.ts';
import { InvalidArgumentError } from '../../shared/domain/InvalidArgumentError.ts';
import { UserCreatedAt } from './UserCreatedAt.ts';

// Identidad pública; el contrato de autenticación añade rol y perfil en AuthUser.
export interface UserPrimitives {
  id: string;
  email: string;
}

export interface AuthUser extends UserPrimitives { role: 'user' | 'admin'; profile: Profile }

export interface UserRecord extends UserPrimitives {
  role?: string;
  status?: string;
  displayName?: string | null;
  bio?: string | null;
  interestIds?: string[];
  onboardingCompletedAt?: string | Date | null;
  passwordHash: string;
  createdAt: string | Date;
}

export class User {
  readonly role: UserRole;
  readonly status: 'active' | 'suspended' | 'deleted';
  readonly profile: Profile;
  readonly id: UserId;
  readonly email: UserEmail;
  readonly passwordHash: UserPasswordHash;
  readonly createdAt: UserCreatedAt;

  constructor(id: UserId, email: UserEmail, passwordHash: UserPasswordHash, createdAt: UserCreatedAt, attributes: Partial<UserRecord> = {}) {
    this.role = new UserRole(attributes.role);
    const status = attributes.status ?? 'active';
    if (!['active', 'suspended', 'deleted'].includes(status)) throw new InvalidArgumentError('Estado inválido.');
    this.status = status as typeof this.status;
    this.profile = { displayName: attributes.displayName ?? null, bio: attributes.bio ?? '',
      interestIds: [...(attributes.interestIds ?? [])], completed: !!attributes.onboardingCompletedAt };
    this.id = id;
    this.email = email;
    this.passwordHash = passwordHash;
    this.createdAt = createdAt;
  }

  static fromPrimitives(value: UserRecord): User {
    return new User(new UserId(value.id), new UserEmail(value.email),
      new UserPasswordHash(value.passwordHash), new UserCreatedAt(value.createdAt), value);
  }

  toPrimitives(): UserPrimitives {
    return { id: this.id.value, email: this.email.value };
  }

  toAuth(): AuthUser {
    return { ...this.toPrimitives(), role: this.role.value, profile: { ...this.profile, interestIds: [...this.profile.interestIds] } };
  }

  toJSON(): UserPrimitives {
    return this.toPrimitives();
  }

  toDetails() {
    return { ...this.toAuth(), status: this.status, createdAt: this.createdAt.value };
  }
}
