import { DomainError } from './DomainError.ts';
export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
}
