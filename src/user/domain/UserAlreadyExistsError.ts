import { DomainError } from '../../shared/domain/DomainError.ts';

export class UserAlreadyExistsError extends DomainError {
  readonly code = 'EMAIL_ALREADY_EXISTS';

  constructor() {
    super('Ya existe un usuario con ese correo.');
  }
}
