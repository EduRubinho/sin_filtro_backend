import type { AuthUser } from './User.ts';

export interface Session {
  token: string;
  expiresAt: string;
  user: AuthUser;
}
