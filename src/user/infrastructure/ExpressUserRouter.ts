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
  router.use('/auth/register', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10,
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Demasiados intentos. Vuelve a intentar en 15 minutos.' } },
  }));
  router.use(json({ limit: '8kb' }));
  router.post('/auth/register', controller.register);
  router.patch('/auth/profile', controller.updateProfile);
  router.get('/categories', controller.categories);
  router.post('/auth/login', controller.login);
  router.get('/auth/me', controller.me);
  router.post('/auth/logout', controller.logout);
  // Herramientas CRUD de desarrollo: requieren sesión administrativa vigente.
  if (environment === 'development') {
    router.use('/users', controller.requireAdmin);
    router.get('/users', controller.getAll);
    router.get('/users/:id', controller.getOneById);
    router.post('/users', controller.create);
    router.patch('/users/:id', controller.edit);
    router.delete('/users/:id', controller.delete);
  }
  return router;
}
