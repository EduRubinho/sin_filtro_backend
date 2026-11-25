import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import sharp from 'sharp';
import type { PhotoStorage, ImageProcessor } from '../domain/Album.ts';
import { InvalidArgumentError } from '../../shared/domain/InvalidArgumentError.ts';
export class LocalPhotoStorage implements PhotoStorage {
  private readonly root: string;
  constructor(root: string) { this.root=resolve(root); }
  private path(key: string) { if (!/^[a-f0-9-]{36}\.jpg$/.test(key)) throw new Error('Invalid storage key'); return join(this.root,key); }
  async write(key: string,data: Buffer) { await mkdir(this.root,{recursive:true,mode:0o700}); await writeFile(this.path(key),data,{flag:'wx',mode:0o600}); }
  read(key: string) { return readFile(this.path(key)); }
  async remove(key: string) { await rm(this.path(key),{force:true}); }
}
export class SharpImages implements ImageProcessor {
  async process(input: Buffer) {
    try {
      const image=sharp(input,{limitInputPixels:40_000_000,animated:false});
      const metadata=await image.metadata();
      if (!['jpeg','png','webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1)>1) throw new Error('Unsupported');
      const {data,info}=await image.rotate().resize(1600,1600,{fit:'inside',withoutEnlargement:true}).jpeg({quality:80}).toBuffer({resolveWithObject:true});
      return {data,width:info.width,height:info.height}; // sin EXIF ni GPS
    } catch { throw new InvalidArgumentError('Selecciona una imagen JPEG, PNG o WebP válida (máximo 40 megapíxeles).'); }
  }
}
