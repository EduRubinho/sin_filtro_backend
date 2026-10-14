import type { User } from './User.ts';
import type { Session } from './Session.ts';
import type { SessionToken } from './SessionToken.ts';
import type { UserId } from './UserId.ts';

export interface SessionRepository {
  create(user: User): Promise<Session>;
  find(token: SessionToken): Promise<Session | null>;
  revoke(token: SessionToken): Promise<void>;
  revokeByUserId(id: UserId): Promise<void>;
}
