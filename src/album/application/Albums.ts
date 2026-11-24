import type { AlbumRepository, ImageProcessor, PhotoStorage } from '../domain/Album.ts';
import { caption } from '../domain/Album.ts';
import { eventId } from '../../event/domain/Event.ts';
import { mapSearch } from '../../event/domain/MapActivity.ts';
import { InvalidArgumentError } from '../../shared/domain/InvalidArgumentError.ts';
import { AuthError } from '../../user/domain/AuthError.ts';
export class Albums {
  private readonly repository: AlbumRepository; private readonly storage: PhotoStorage; private readonly images: ImageProcessor;
  constructor(repository: AlbumRepository, storage: PhotoStorage, images: ImageProcessor) { this.repository=repository;this.storage=storage;this.images=images; }
  list(user: string, query: Record<string, unknown>) {
    const { mode = 'mine', offset = '0', ...location } = query;
    if (typeof mode !== 'string' || !['mine','nearby'].includes(mode) || typeof offset !== 'string' || !/^\d+$/.test(offset) || !Number.isSafeInteger(Number(offset))) throw new InvalidArgumentError('Consulta inválida.');
    if (mode === 'mine' && Object.keys(location).length) throw new InvalidArgumentError('Consulta inválida.');
    return this.repository.list(user, Number(offset), mode === 'nearby' ? mapSearch(location) : undefined);
  }
  detail(id: unknown, user: string, before?: unknown) { return this.repository.detail(eventId(id),user,before === undefined ? undefined : eventId(before)); }
  async upload(id: unknown, user: string, key: unknown, body: unknown) {
    if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(key) || !Buffer.isBuffer(body) || !body.length || body.length>8*1024*1024) throw new InvalidArgumentError('Imagen o identificador de subida inválidos.');
    const {album} = await this.repository.detail(eventId(id),user);
    if (!album.canUpload) throw new AuthError('FORBIDDEN'); // autorizar antes de decodificar
    const image = await this.images.process(body);
    return this.repository.add(eventId(id),user,key,'',image,this.storage);
  }
  async content(id: unknown,user: string) { const value=await this.repository.photo(eventId(id),user); return this.storage.read(value.key); }
  edit(id: unknown,user: string,body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).join() !== 'caption') throw new InvalidArgumentError('Envía únicamente caption.');
    return this.repository.edit(eventId(id),user,caption((body as {caption:unknown}).caption));
  }
  delete(id: unknown,user: string) { return this.repository.delete(eventId(id),user,this.storage); }
}
