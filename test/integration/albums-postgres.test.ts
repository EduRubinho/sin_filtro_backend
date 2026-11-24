import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { readFile,mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client,Pool } from 'pg';
import sharp from 'sharp';
import { Albums } from '../../src/album/application/Albums.ts';
import { PostgresAlbumRepository } from '../../src/album/infrastructure/PostgresAlbumRepository.ts';
import { LocalPhotoStorage,SharpImages } from '../../src/album/infrastructure/LocalPhotoStorage.ts';
import { ExpressAlbumRouter } from '../../src/album/infrastructure/ExpressAlbumRouter.ts';
import { createHttpApp } from '../../src/shared/infrastructure/HttpApp.ts';
import type { UserUseCases } from '../../src/user/infrastructure/ExpressUserController.ts';
import { AuthError } from '../../src/user/domain/AuthError.ts';
import { once } from 'node:events';
test('álbumes: permisos, subida real, reintento, archivos, edición, borrado, radio y paginación', {skip:process.env.RUN_POSTGRES_TESTS!=='1'},async()=>{
 const name=`sinfiltro_albums_test_${randomBytes(8).toString('hex')}`;const admin=new Client({connectionString:process.env.DATABASE_URL});const url=new URL(process.env.DATABASE_URL!);url.pathname=`/${name}`;
 const pool=new Pool({connectionString:url.toString()});const dir=await mkdtemp(join(tmpdir(),'sinfiltro-albums-'));let created=false;let server:ReturnType<ReturnType<typeof createHttpApp>['listen']>|undefined;
 try{
 await admin.connect();await admin.query(`CREATE DATABASE "${name}"`);created=true;
 await pool.query(await readFile(new URL('../../docs/database/schema.sql',import.meta.url),'utf8'));
 await pool.query(await readFile(new URL('../../docs/database/album-photos.sql',import.meta.url),'utf8')); // reejecutable
 await pool.query("INSERT INTO public.users(email,password_hash) VALUES('owner@test.com','hash'),('attended@test.com','hash'),('outsider@test.com','hash')");
 const c=await pool.connect();try{await c.query('BEGIN');await c.query(`INSERT INTO public.activities(organizer_id,category_id,title,location_name,location,starts_at,ends_at,status,album_visibility)
 VALUES(1,1,'Privado','Tacna',ST_SetSRID(ST_MakePoint(-70,-18),4326)::geography,now()-interval '2 hours',now()-interval '1 hour','published','private'),
 (1,1,'Público','Tacna',ST_SetSRID(ST_MakePoint(-70,-18),4326)::geography,now()-interval '2 hours',now()-interval '1 hour','published','public'),
 (1,1,'Cancelado','Tacna',ST_SetSRID(ST_MakePoint(-70,-18),4326)::geography,now()-interval '2 hours',now()-interval '1 hour','cancelled','public'),
 (1,1,'Activo','Tacna',ST_SetSRID(ST_MakePoint(-70,-18),4326)::geography,now()+interval '1 hour',now()+interval '2 hours','published','public')`);
 await c.query('INSERT INTO public.activity_participants(activity_id,user_id) SELECT a.id,u.id FROM public.activities a CROSS JOIN public.users u');
 await c.query("INSERT INTO public.activity_checkin_codes(activity_id,issued_by,pin_hash,expires_at) SELECT id,1,repeat('a',64),now()+interval '1 hour' FROM public.activities");
 await c.query('UPDATE public.activity_participants p SET attendance_validated_at=now(),attendance_code_id=c.id FROM public.activity_checkin_codes c WHERE p.activity_id=c.activity_id AND p.user_id=2');
 await c.query('COMMIT');}finally{c.release();}
 const repo=new PostgresAlbumRepository(pool);const app=new Albums(repo,new LocalPhotoStorage(dir),new SharpImages());
 const users={getCurrent:{execute:async(token:string)=>{if(!['1','2','3','admin'].includes(token))throw new AuthError('UNAUTHORIZED');return {id:token,role:token==='admin'?'admin':'user'};}}} as unknown as UserUseCases;
 server=createHttpApp(ExpressAlbumRouter(app,users)).listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
 const req=(path:string,user='2',method='GET',body?:BodyInit,headers:Record<string,string>={})=>fetch(base+path,{method,headers:{Authorization:`Bearer ${user}`,...headers},body});
 assert.equal((await fetch(base+'/albums')).status,401);assert.equal((await req('/albums','admin')).status,403);
 assert.equal((await req('/activities/1/album','1')).status,403); // organizador sin asistencia
 assert.equal((await req('/activities/1/album','3')).status,403);
 assert.equal((await req('/activities/2/album','3')).status,200);
 assert.equal((await req('/activities/3/album')).status,404);assert.equal((await req('/activities/4/album')).status,404);
 const jpeg=await sharp({create:{width:10,height:10,channels:3,background:'blue'}}).jpeg().toBuffer();
 const upload=()=>req('/activities/1/album/photos','2','POST',jpeg,{'Content-Type':'image/jpeg','X-Upload-ID':'unique-photo-request-0001'});
 assert.equal((await req('/activities/2/album/photos','3','POST',jpeg,{'Content-Type':'image/jpeg','X-Upload-ID':'outsider-request-0001'})).status,403);
 const response=await upload();assert.equal(response.status,201);const photo=(await response.json()).photo;assert.ok(photo.sizeBytes>0);assert.match(photo.createdAt,/^\d{4}-\d{2}-\d{2}T.*Z$/);
 assert.equal((await (await upload()).json()).photo.id,photo.id);assert.equal((await pool.query('SELECT count(*) FROM public.album_photos')).rows[0].count,'1');
 assert.equal((await req(`/photos/${photo.id}/content`,'3')).status,403);
 const content=await req(`/photos/${photo.id}/content`);assert.equal(content.status,200);assert.match(content.headers.get('cache-control')! ,/no-store/);assert.equal((await sharp(Buffer.from(await content.arrayBuffer())).metadata()).format,'jpeg');
 assert.equal((await req(`/photos/${photo.id}`,'1','PATCH',JSON.stringify({caption:'bad'}),{'Content-Type':'application/json'})).status,403);
 assert.equal((await req(`/photos/${photo.id}`,'2','PATCH',JSON.stringify({caption:'Recuerdo'}),{'Content-Type':'application/json'})).status,204);
 assert.equal((await app.detail('1','2')).photos[0].caption,'Recuerdo');
 assert.equal((await app.list('2',{})).length,2);assert.equal((await app.list('3',{})).length,0);
 assert.equal((await app.list('3',{mode:'nearby',lat:'-18',lng:'-70',radiusMeters:'500'})).length,1);
 assert.equal((await app.list('2',{mode:'nearby',lat:'0',lng:'0',radiusMeters:'500'})).length,0);
 for(let i=0;i<31;i++)await app.upload('1','2',`pagination-upload-${String(i).padStart(4,'0')}`,jpeg);
 const firstPage=await app.detail('1','2');assert.equal(firstPage.photos.length,30);assert.ok(firstPage.nextCursor);
 const secondPage=await app.detail('1','2',firstPage.nextCursor);assert.equal(secondPage.photos.length,2);assert.equal(secondPage.nextCursor,null);
 assert.ok(!firstPage.photos.some(p=>secondPage.photos.some(q=>q.id===p.id)));
 await pool.query("UPDATE public.activity_participants SET attendance_revoked_at=clock_timestamp() WHERE activity_id=1 AND user_id=2");
 assert.equal((await req(`/photos/${photo.id}/content`)).status,403);
 assert.equal((await req(`/photos/${photo.id}`,'2','DELETE')).status,204);
 assert.equal((await req(`/photos/${photo.id}`,'2','DELETE')).status,204);
 assert.equal((await req(`/photos/${photo.id}/content`)).status,404);
 }finally{if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));await pool.end();if(created)await admin.query(`DROP DATABASE "${name}" WITH(FORCE)`);await admin.end();await rm(dir,{recursive:true,force:true});}
});
