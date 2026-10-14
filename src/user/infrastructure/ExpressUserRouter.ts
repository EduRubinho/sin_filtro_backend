import { json, Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { ExpressUserController, type UserUseCases } from './ExpressUserController.ts';

export function ExpressUserRouter(users: UserUseCases, environment = process.env.NODE_ENV ?? 'development'): Router {
  const router = Router();
  const controller = new ExpressUserController(users);
  router.use('/auth/login', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Demasiados intentos. Vuelve a intentar en 15 minutos.' } },
  }));
  router.use(json({ limit: '8kb' }));
  router.post('/auth/login', controller.login);
  router.get('/auth/me', controller.me);
  router.post('/auth/logout', controller.logout);
  // CRUD público únicamente en desarrollo, según el alcance acordado.
  if (environment === 'development') {
    router.get('/users', controller.getAll);
    router.get('/users/:id', controller.getOneById);
    router.post('/users', controller.create);
    router.patch('/users/:id', controller.edit);
    router.delete('/users/:id', controller.delete);
  }
  return router;
}
