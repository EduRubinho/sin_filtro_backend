import { createHash, randomBytes } from 'node:crypto';
import type { SessionRepository } from '../domain/SessionRepository.ts';
import type { AuthUser } from '../domain/User.ts';

// Adaptador para un solo proceso. Reiniciar el servidor invalida sus sesiones.
export function memorySessions(ttlMs = 30 * 60 * 1000, now = Date.now): SessionRepository {
  const entries = new Map<string, { user: AuthUser; expires: number }>();
  const digest = (token: string) => createHash('sha256').update(token).digest('hex');
  function prune() {
    for (const [key, value] of entries) if (value.expires <= now()) entries.delete(key);
  }
  return {
    async create(user) {
      prune();
      if (entries.size >= 10000) throw new Error('Capacidad de sesiones alcanzada.');
      const token = randomBytes(32).toString('base64url');
      const expires = now() + ttlMs;
      entries.set(digest(token), { user: user.toAuth(), expires });
      return { token, expiresAt: new Date(expires).toISOString(), user: user.toAuth() };
    },
    async find(token) {
      prune();
      const value = entries.get(digest(token.value));
      return value ? { token: token.value, expiresAt: new Date(value.expires).toISOString(), user: { ...value.user } } : null;
    },
    async revoke(token) { entries.delete(digest(token.value)); },
    async revokeByUserId(id) {
      for (const [key, entry] of entries) {
        if (entry.user.id === id.value) entries.delete(key);
      }
    },
  };
}
