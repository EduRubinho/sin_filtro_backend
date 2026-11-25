import type { PhotoStorage } from '../domain/Album.ts';
import { LocalPhotoStorage } from './LocalPhotoStorage.ts';

// Solo el servidor posee esta clave. Los permisos de álbum se validan antes de acceder.
export function createPhotoStorage(env: NodeJS.ProcessEnv = process.env): PhotoStorage {
  if (!env.SUPABASE_URL && !env.SUPABASE_SECRET_KEY) {
    if (env.NODE_ENV === 'production' && !env.PHOTO_STORAGE_DIR) {
      throw new Error('Configura Supabase Storage o PHOTO_STORAGE_DIR persistente para producción.');
    }
    return new LocalPhotoStorage(env.PHOTO_STORAGE_DIR ?? './storage/photos');
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_')) {
    throw new Error('Configura SUPABASE_URL y SUPABASE_SECRET_KEY (sb_secret_).');
  }
  const base = new URL(env.SUPABASE_URL);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/') {
    throw new Error('SUPABASE_URL debe ser el origen HTTPS del proyecto.');
  }
  const bucket = encodeURIComponent(env.SUPABASE_STORAGE_BUCKET ?? 'activity-photos');
  const secret = env.SUPABASE_SECRET_KEY;
  function keyPath(key: string) {
    if (!/^[a-f0-9-]{36}\.jpg$/.test(key)) throw new Error('Invalid storage key');
    return `${bucket}/${key}`;
  }
  async function request(path: string, method: string, body?: Uint8Array | string) {
    const response = await fetch(`${base.origin}/storage/v1/object/${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { apikey: secret, 'Content-Type': typeof body === 'string' ? 'application/json' : 'image/jpeg', 'x-upsert': 'false' },
      body: body as BodyInit | undefined,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Supabase Storage: ${method} falló (${response.status}).`);
    }
    return response;
  }
  return {
    async write(key, data) {
      const response = await request(keyPath(key), 'POST', new Uint8Array(data));
      await response.body?.cancel();
    },
    async read(key) {
      const response = await request(`authenticated/${keyPath(key)}`, 'GET');
      return Buffer.from(await response.arrayBuffer());
    },
    async remove(key) {
      keyPath(key);
      const response = await request(bucket, 'DELETE', JSON.stringify({ prefixes: [key] }));
      await response.body?.cancel();
    },
  };
}
