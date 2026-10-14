import { DomainError } from './DomainError.ts';

export class InvalidArgumentError extends DomainError {
  readonly code = 'INVALID_INPUT';
}
