import { DomainError } from '../../shared/domain/DomainError.ts';
import { InvalidArgumentError } from '../../shared/domain/InvalidArgumentError.ts';

export class AttendanceError extends DomainError {
  readonly code: string;
  constructor(message: string, code = 'CONFLICT') { super(message); this.code = code; }
}
export interface AttendanceInfo {
  opensAt: string; closesAt: string; open: boolean; isOrganizer: boolean;
  validatedAt: string | null; lockedUntil: string | null; codeExpiresAt: string | null;
  enrolled: number; confirmed: number; pending: number;
  participants: { id: string; displayName: string; validatedAt: string | null }[];
}
export interface IssuedPin { pin: string; expiresAt: string }
export interface AttendanceRepository {
  info(activityId: string, userId: string): Promise<AttendanceInfo>;
  issue(activityId: string, userId: string): Promise<IssuedPin>;
  revoke(activityId: string, userId: string): Promise<void>;
  validate(activityId: string, userId: string, pin: string): Promise<{ validatedAt: string }>;
}
export function attendancePin(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 ||
      !('pin' in input) || typeof input.pin !== 'string' || !/^\d{6}$/.test(input.pin)) {
    throw new InvalidArgumentError('Ingresa un PIN de exactamente seis dígitos.');
  }
  return input.pin;
}
