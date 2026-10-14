import type { UserPrimitives } from './User.ts';

export interface Session {
  token: string;
  expiresAt: string;
  user: UserPrimitives;
}
