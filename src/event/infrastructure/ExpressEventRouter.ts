import { AuthError } from '../../user/domain/AuthError.ts';
import { json, Router } from 'express';
import type { EventManagement } from '../application/EventManagement.ts';
import { ExpressUserController, type UserUseCases } from '../../user/infrastructure/ExpressUserController.ts';
import { rateLimit } from 'express-rate-limit';
import type { ActivityChat } from '../application/ActivityChat.ts';
import type { ChatRealtimePublisher } from './ActivityChatRealtime.ts';

export function ExpressEventRouter(events: EventManagement, users: UserUseCases, chats?: ActivityChat, realtime?: ChatRealtimePublisher): Router {
  const router = Router();
  const authenticated = async (authorization: string | undefined) => {
    const token = /^Bearer (.+)$/.exec(authorization ?? '')?.[1];
    if (!token) throw new AuthError('UNAUTHORIZED');
    return users.getCurrent.execute(token);
  };
  const regularUser = async (authorization: string | undefined) => {
    const user = await authenticated(authorization);
    if (user.role !== 'user') throw new AuthError('FORBIDDEN');
    return user;
  };
  // Lectura para cuentas autenticadas: nunca abre el CRUD administrativo a usuarios.
  router.get('/activities/map', async (req, res) => {
    await authenticated(req.headers.authorization);
    res.json(await events.map(req.query));
  });
  router.use('/activities', json({ limit: '16kb' }));
  router.get('/activities/mine', async (req, res) => {
    const user = await regularUser(req.headers.authorization);
    res.json(await events.plans(user.id));
  });
  router.post('/activities', async (req, res) => {
    const user = await regularUser(req.headers.authorization);
    const event = await events.createPublished(user.id, req.body);
    res.location(`/activities/${event.id}`).status(201).json({ event });
  });
  router.get('/activities/:id', async (req, res) => {
    const user = await regularUser(req.headers.authorization);
    res.json({ activity: await events.detail(req.params.id, user.id) });
  });
  router.get('/activities/:id/participants', async (req, res) => {
    const user = await regularUser(req.headers.authorization);
    const participants = await events.participants(req.params.id, user.id);
    res.json({ participants, participantCount: participants.length });
  });
  if (chats) {
    router.get('/activities/:id/chat/messages', async (req, res) => {
      const user = await regularUser(req.headers.authorization);
      res.json(await chats.history(req.params.id, user.id, req.query));
    });
    router.post('/activities/:id/chat/messages', rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
      message: { error: { code: 'RATE_LIMITED', message: 'Estás enviando mensajes demasiado rápido.' } } }), async (req, res) => {
      const user = await regularUser(req.headers.authorization);
      const message = await chats.send(req.params.id, user.id, req.body);
      void realtime?.broadcast(message).catch(() => console.error('No se pudo notificar un mensaje en tiempo real.'));
      res.status(201).json({ message });
    });
    router.post('/activities/:id/chat/read', async (req, res) => {
      const user = await regularUser(req.headers.authorization);
      await chats.markRead(req.params.id, user.id, req.body?.messageId);
      res.status(204).end();
    });
  }
  router.post('/activities/:id/join', async (req, res) => {
    const user = await regularUser(req.headers.authorization);
    res.json({ activity: await events.join(req.params.id, user.id) });
  });
  router.delete('/activities/:id/join', async (req, res) => {
    const user = await regularUser(req.headers.authorization);
    res.json({ activity: await events.leave(req.params.id, user.id) });
  });
  router.patch('/activities/:id', async (req, res) => {
    const user = await regularUser(req.headers.authorization);
    res.json({ activity: await events.updateOwned(req.params.id, user.id, req.body) });
  });
  router.post('/activities/:id/cancel', async (req, res) => {
    const user = await regularUser(req.headers.authorization);
    res.json({ activity: await events.cancelOwned(req.params.id, user.id) });
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
