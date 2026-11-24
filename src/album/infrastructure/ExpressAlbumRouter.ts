import { Router,json,raw } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Albums } from '../application/Albums.ts';
import type { UserUseCases } from '../../user/infrastructure/ExpressUserController.ts';
import { AuthError } from '../../user/domain/AuthError.ts';
export function ExpressAlbumRouter(albums:Albums,users:UserUseCases) {
 const r=Router();
 r.use(['/albums','/photos','/activities/:id/album'],async(req,res,next)=>{
   const token=/^Bearer (.+)$/.exec(req.headers.authorization??'')?.[1];if(!token) throw new AuthError('UNAUTHORIZED');
   const user=await users.getCurrent.execute(token);if(user.role!=='user') throw new AuthError('FORBIDDEN');res.locals.userId=user.id;res.set('Cache-Control','private, no-store');next();
 });
 r.get('/albums',async(req,res)=>{const rows=await albums.list(res.locals.userId,req.query);res.json({albums:rows.slice(0,20),hasMore:rows.length>20});});
 r.get('/activities/:id/album',async(req,res)=>res.json(await albums.detail(req.params.id,res.locals.userId,req.query.before)));
 r.post('/activities/:id/album/photos',rateLimit({windowMs:60_000,limit:20}),raw({type:'image/jpeg',limit:'8mb'}),async(req,res)=>res.status(201).json({photo:await albums.upload(req.params.id,res.locals.userId,req.headers['x-upload-id'],req.body)}));
 r.get('/photos/:id/content',async(req,res)=>{const data=await albums.content(req.params.id,res.locals.userId);res.type('image/jpeg').send(data);});
 r.patch('/photos/:id',json({limit:'4kb'}),async(req,res)=>{await albums.edit(req.params.id,res.locals.userId,req.body);res.status(204).end();});
 r.delete('/photos/:id',async(req,res)=>{await albums.delete(req.params.id,res.locals.userId);res.status(204).end();});
 return r;
}
