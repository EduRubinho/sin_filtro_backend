import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Album, AlbumRepository, Photo, PhotoStorage } from '../domain/Album.ts';
import { AuthError } from '../../user/domain/AuthError.ts';
import { EventNotFoundError } from '../../event/domain/Event.ts';
import { ConflictError } from '../../shared/domain/ConflictError.ts';
const eligible = `a.deleted_at IS NULL AND (a.status='completed' OR (a.status='published' AND a.ends_at<=clock_timestamp()))`;
const attended = `p.attendance_validated_at IS NOT NULL AND p.attendance_revoked_at IS NULL AND p.status<>'removed'`;
const fields = `a.id::text AS "activityId",a.title,a.location_name AS "locationName",to_char(a.ends_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endsAt",a.album_visibility AS visibility,
 COALESCE((${attended}),false) AS "canUpload",
 (SELECT count(*)::int FROM public.album_photos f JOIN public.albums b ON b.id=f.album_id WHERE b.activity_id=a.id AND b.deleted_at IS NULL AND f.deleted_at IS NULL) AS "photoCount",
 (SELECT f.id::text FROM public.album_photos f JOIN public.albums b ON b.id=f.album_id WHERE b.activity_id=a.id AND b.deleted_at IS NULL AND f.deleted_at IS NULL ORDER BY f.id DESC LIMIT 1) AS "coverId"`;
const photoFields = `f.id::text,b.activity_id::text AS "activityId",f.uploaded_by::text AS "uploadedBy",f.caption,to_char(f.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",f.size_bytes AS "sizeBytes",f.width,f.height`;
export class PostgresAlbumRepository implements AlbumRepository {
  private readonly pool: Pool;
  constructor(pool: Pool) { this.pool=pool; }
  private async transaction<T>(work:(c:PoolClient)=>Promise<T>) { const c=await this.pool.connect(); try { await c.query('BEGIN');const result=await work(c);await c.query('COMMIT');return result; } catch(e) {await c.query('ROLLBACK');throw e;} finally {c.release();} }
  private async access(c:PoolClient,id:string,user:string,write=false):Promise<Album> {
    await c.query('SELECT id FROM public.activities WHERE id=$1 FOR UPDATE',[id]);
    const result=await c.query<Album>(`SELECT ${fields} FROM public.activities a
      LEFT JOIN public.activity_participants p ON p.activity_id=a.id AND p.user_id=$2
      WHERE a.id=$1 AND ${eligible} AND NOT EXISTS(SELECT 1 FROM public.albums b WHERE b.activity_id=a.id AND b.deleted_at IS NOT NULL)`,[id,user]);
    const album=result.rows[0]; if(!album) throw new EventNotFoundError();
    const account=await c.query("SELECT id FROM public.users WHERE id=$1 AND role='user' AND status='active' FOR SHARE",[user]);
    if(!account.rowCount || (write || album.visibility==='private') && !album.canUpload) throw new AuthError('FORBIDDEN');
    return album;
  }
  async list(user:string,offset:number,nearby?:{latitude:number;longitude:number;radiusMeters:number}) {
    return (await this.pool.query<Album>(`SELECT ${fields} FROM public.activities a
      LEFT JOIN public.activity_participants p ON p.activity_id=a.id AND p.user_id=$1
      JOIN public.users u ON u.id=$1 AND u.role='user' AND u.status='active'
      WHERE ${eligible} AND NOT EXISTS(SELECT 1 FROM public.albums b WHERE b.activity_id=a.id AND b.deleted_at IS NOT NULL)
      AND CASE WHEN $2::boolean THEN (a.album_visibility='public' OR (${attended}))
        AND ST_DWithin(a.location,ST_SetSRID(ST_MakePoint($3,$4),4326)::geography,$5) ELSE (${attended}) END
      ORDER BY a.ends_at DESC,a.id DESC LIMIT 21 OFFSET $6`,[user,!!nearby,nearby?.longitude??0,nearby?.latitude??0,nearby?.radiusMeters??500,offset])).rows;
  }
  detail(id:string,user:string,before?:string) {
    return this.transaction(async c=>{
      const album=await this.access(c,id,user);
      await c.query(`INSERT INTO public.albums(activity_id,created_by,title,visibility)
        SELECT id,organizer_id,title,album_visibility FROM public.activities WHERE id=$1 ON CONFLICT(activity_id) DO NOTHING`,[id]);
      const rows=(await c.query<Photo>(`SELECT ${photoFields} FROM public.album_photos f JOIN public.albums b ON b.id=f.album_id
        WHERE b.activity_id=$1 AND f.deleted_at IS NULL AND ($2::bigint IS NULL OR f.id<$2) ORDER BY f.id DESC LIMIT 31`,[id,before??null])).rows;
      return {album,photos:rows.slice(0,30),nextCursor:rows.length>30?rows[29].id:null};
    });
  }
  async add(id:string,user:string,uploadId:string,caption:string,image:{data:Buffer;width:number;height:number},storage:PhotoStorage) {
    const key=`${randomUUID()}.jpg`; let written=false;
    try {return await this.transaction(async c=>{
      await this.access(c,id,user,true);
      const old=await c.query<Photo & {deleted:boolean}>(`SELECT ${photoFields},(f.deleted_at IS NOT NULL) AS deleted FROM public.album_photos f JOIN public.albums b ON b.id=f.album_id WHERE f.upload_id=$1 AND f.uploaded_by=$2`,[uploadId,user]);
      if(old.rows[0]) {if(old.rows[0].deleted || old.rows[0].activityId!==id) throw new ConflictError('Esta subida ya fue usada.'); const {deleted:_,...photo}=old.rows[0];return photo;}
      const b=await c.query(`INSERT INTO public.albums(activity_id,created_by,title,visibility) SELECT id,organizer_id,title,album_visibility FROM public.activities WHERE id=$1
        ON CONFLICT(activity_id) DO UPDATE SET title=public.albums.title RETURNING id`,[id]);
      await storage.write(key,image.data);written=true;
      const f=await c.query(`INSERT INTO public.album_photos(album_id,uploaded_by,storage_key,caption,size_bytes,width,height,upload_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[b.rows[0].id,user,key,caption,image.data.length,image.width,image.height,uploadId]);
      return (await c.query<Photo>(`SELECT ${photoFields} FROM public.album_photos f JOIN public.albums b ON b.id=f.album_id WHERE f.id=$1`,[f.rows[0].id])).rows[0];
    });} catch(e) {if(written) await storage.remove(key).catch(()=>console.error('Archivo pendiente de limpieza.'));throw e;}
  }
  photo(id:string,user:string) {return this.transaction(async c=>{
    const result=await c.query<Photo & {key:string}>(`SELECT ${photoFields},f.storage_key AS key FROM public.album_photos f JOIN public.albums b ON b.id=f.album_id WHERE f.id=$1 AND f.deleted_at IS NULL AND b.deleted_at IS NULL`,[id]);
    const row=result.rows[0];if(!row) throw new EventNotFoundError();
    await this.access(c,row.activityId,user);
    const current=await c.query('SELECT id FROM public.album_photos WHERE id=$1 AND deleted_at IS NULL',[id]);
    if(!current.rowCount) throw new EventNotFoundError();
    const {key,...photo}=row;return {photo,key};
  });}
  async edit(id:string,user:string,caption:string) {await this.transaction(async c=>{
    const row=(await c.query('SELECT b.activity_id,f.uploaded_by FROM public.album_photos f JOIN public.albums b ON b.id=f.album_id WHERE f.id=$1 AND f.deleted_at IS NULL',[id])).rows[0];
    if(!row) throw new EventNotFoundError();if(String(row.uploaded_by)!==user) throw new AuthError('FORBIDDEN');
    await this.access(c,String(row.activity_id),user,true);
    await c.query('UPDATE public.album_photos SET caption=$2 WHERE id=$1 AND deleted_at IS NULL',[id,caption]);
  });}
  async delete(id:string,user:string,storage:PhotoStorage) {
    const key=await this.transaction(async c=>{
      const row=(await c.query('SELECT b.activity_id,f.uploaded_by,f.storage_key FROM public.album_photos f JOIN public.albums b ON b.id=f.album_id WHERE f.id=$1',[id])).rows[0];
      if(!row) throw new EventNotFoundError();if(String(row.uploaded_by)!==user) throw new AuthError('FORBIDDEN');
      // El autor puede retirar su foto aunque haya perdido asistencia o el evento se cancele.
      await c.query('SELECT id FROM public.activities WHERE id=$1 FOR UPDATE',[row.activity_id]);
      await c.query('UPDATE public.album_photos SET deleted_at=COALESCE(deleted_at,clock_timestamp()) WHERE id=$1',[id]);return String(row.storage_key);
    });
    await storage.remove(key); // reintentar DELETE también limpia el archivo si falló el disco
  }
}
