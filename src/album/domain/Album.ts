import { InvalidArgumentError } from '../../shared/domain/InvalidArgumentError.ts';
export interface Photo { id: string; activityId: string; uploadedBy: string; caption: string | null; createdAt: string; sizeBytes: number; width: number; height: number }
export interface Album { activityId: string; title: string; locationName: string; endsAt: string; visibility: 'public' | 'private'; photoCount: number; coverId: string | null; canUpload: boolean }
export interface PhotoStorage { write(key: string, data: Buffer): Promise<void>; read(key: string): Promise<Buffer>; remove(key: string): Promise<void> }
export interface ImageProcessor { process(data: Buffer): Promise<{ data: Buffer; width: number; height: number }> }
export interface AlbumRepository {
  list(userId: string, offset: number, nearby?: { latitude: number; longitude: number; radiusMeters: number }): Promise<Album[]>;
  detail(activityId: string, userId: string, before?: string): Promise<{ album: Album; photos: Photo[]; nextCursor: string | null }>;
  add(activityId: string, userId: string, uploadId: string, caption: string, image: { data: Buffer; width: number; height: number }, storage: PhotoStorage): Promise<Photo>;
  photo(id: string, userId: string): Promise<{ photo: Photo; key: string }>;
  edit(id: string, userId: string, caption: string): Promise<void>;
  delete(id: string, userId: string, storage: PhotoStorage): Promise<void>;
}
export function caption(value: unknown): string {
  if (typeof value !== 'string' || value.length > 500) throw new InvalidArgumentError('La descripción admite hasta 500 caracteres.');
  return value.trim();
}
