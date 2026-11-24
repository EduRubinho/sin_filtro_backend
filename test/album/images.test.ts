import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { SharpImages, LocalPhotoStorage } from '../../src/album/infrastructure/LocalPhotoStorage.ts';
import { caption } from '../../src/album/domain/Album.ts';
test('imágenes: valida contenido, limita dimensiones, elimina EXIF y conserva JPEG',async()=>{
 const processor=new SharpImages();
 const original=await sharp({create:{width:2000,height:1200,channels:3,background:'red'}}).withMetadata().jpeg().toBuffer();
 const result=await processor.process(original);assert.equal(result.width,1600);assert.equal(result.height,960);
 const metadata=await sharp(result.data).metadata();assert.equal(metadata.format,'jpeg');assert.equal(metadata.exif,undefined);
 await assert.rejects(processor.process(Buffer.from('<script>bad</script>')),{code:'INVALID_INPUT'});
 assert.throws(()=>caption('a'.repeat(501)));assert.equal(caption(' hello '),'hello');
});
test('almacenamiento privado rechaza rutas arbitrarias y elimina de forma idempotente',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sinfiltro-photos-'));const storage=new LocalPhotoStorage(dir);const key='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg';
 try{await storage.write(key,Buffer.from('photo'));assert.equal((await storage.read(key)).toString(),'photo');assert.throws(()=>storage.read('../secret'));await storage.remove(key);await storage.remove(key);}finally{await rm(dir,{recursive:true,force:true});}
});
