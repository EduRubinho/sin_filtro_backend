import express from 'express';
import type { Router } from 'express';
import { errorHandler } from './ErrorHandler.ts';

export function createHttpApp(routes: Router) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  // Cada router aplica sus límites antes de leer el cuerpo de la petición.
  app.use(routes);
  app.use((_req, res) => { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' } }); });
  app.use(errorHandler);
  return app;
}
