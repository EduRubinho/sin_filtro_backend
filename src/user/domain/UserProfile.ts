import { InvalidArgumentError } from '../../shared/domain/InvalidArgumentError.ts';
import { UserId } from './UserId.ts';

export interface Category { id: string; name: string; slug: string }
export interface ProfileInput { displayName: string; bio: string; interestIds: string[] }
export interface Profile extends Omit<ProfileInput, 'displayName'> { displayName: string | null; completed: boolean }

export function validateProfile(input: unknown): ProfileInput {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['displayName', 'bio', 'interestIds'].includes(key))) {
    throw new InvalidArgumentError('Envía únicamente nombre, biografía e intereses.');
  }
  const { displayName, bio, interestIds } = input as Record<string, unknown>;
  if (typeof displayName !== 'string' || !displayName.trim() || displayName.trim().length > 80) {
    throw new InvalidArgumentError('El nombre debe tener entre 1 y 80 caracteres.');
  }
  if (typeof bio !== 'string' || bio.trim().length > 500) {
    throw new InvalidArgumentError('La biografía admite hasta 500 caracteres.');
  }
  if (!Array.isArray(interestIds) || interestIds.length < 2 || interestIds.length > 50 ||
      new Set(interestIds).size !== interestIds.length) {
    throw new InvalidArgumentError('Selecciona al menos dos intereses distintos (máximo 50).');
  }
  return { displayName: displayName.trim(), bio: bio.trim(), interestIds: interestIds.map(id => new UserId(id).value) };
}
