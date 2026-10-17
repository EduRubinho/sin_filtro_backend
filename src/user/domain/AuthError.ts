import { DomainError } from '../../shared/domain/DomainError.ts';

export class AuthError extends DomainError {
  readonly code: 'INVALID_INPUT' | 'UNAUTHORIZED' | 'FORBIDDEN';

  constructor(code: AuthError['code']) {
    super(code === 'FORBIDDEN' ? 'No tienes permiso para realizar esta acción.' : code === 'INVALID_INPUT' ? 'Ingresa un correo válido y tu contraseña.' : 'Correo o contraseña incorrectos, o sesión vencida.');
    this.code = code;
  }
}
