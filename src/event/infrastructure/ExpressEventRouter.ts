import { AuthError } from '../../user/domain/AuthError.ts';
import { json, Router } from 'express';
import type { EventManagement } from '../application/EventManagement.ts';
import { ExpressUserController, type UserUseCases } from '../../user/infrastructure/ExpressUserController.ts';

export function ExpressEventRouter(events: EventManagement, users: UserUseCases): Router {
  const router = Router();
  const authenticated = async (authorization: string | undefined) => {
    const token = /^Bearer (.+)$/.exec(authorization ?? '')?.[1];
    if (!token) throw new AuthError('UNAUTHORIZED');
    return users.getCurrent.execute(token);
  };
  // Lectura para cuentas autenticadas: nunca abre el CRUD administrativo a usuarios.
  router.get('/activities/map', async (req, res) => {
    await authenticated(req.headers.authorization);
    res.json(await events.map(req.query));
  });
  router.post('/activities', json({ limit: '16kb' }), async (req, res) => {
    const user = await authenticated(req.headers.authorization);
    if (user.role !== 'user') throw new AuthError('FORBIDDEN');
    const event = await events.createPublished(user.id, req.body);
    res.location(`/activities/${event.id}`).status(201).json({ event });
  });
  router.use('/events', new ExpressUserController(users).requireAdmin, json({ limit: '16kb' }));
  router.get('/events', async (req, res) => { res.json({ events: await events.list(req.query.limit, req.query.offset) }); });
  router.get('/events/:id', async (req, res) => { res.json({ event: await events.get(req.params.id) }); });
  router.post('/events', async (req, res) => {
    const event = await events.create(req.body);
    res.location(`/events/${event.id}`).status(201).json({ event });
  });
  router.patch('/events/:id', async (req, res) => { res.json({ event: await events.update(req.params.id, req.body) }); });
  router.delete('/events/:id', async (req, res) => { await events.delete(req.params.id); res.status(204).end(); });
  return router;
}
