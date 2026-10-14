import { DomainError } from '../../shared/domain/DomainError.ts';

export class UserNotFoundError extends DomainError {
  readonly code = 'USER_NOT_FOUND';

  constructor() {
    super('Usuario no encontrado.');
  }
}
