import type { ErrorRequestHandler } from 'express';
import { DomainError } from '../domain/DomainError.ts';

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof DomainError) {
    const statuses: Record<string, number> = { INVALID_INPUT: 400, UNAUTHORIZED: 401, USER_NOT_FOUND: 404, EMAIL_ALREADY_EXISTS: 409 };
    const status = statuses[error.code];
    if (status) {
      res.status(status).json({ error: { code: error.code, message: error.message } });
      return;
    }
  }
  const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
  if (status === 400 || status === 413) {
    res.status(status).json({ error: { code: 'INVALID_INPUT', message: 'Solicitud inválida o demasiado grande.' } });
    return;
  }
  // No registrar cuerpos, hashes, tokens ni detalles de conexión.
  console.error('Error interno procesando la solicitud.');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'No se pudo completar la solicitud.' } });
};
