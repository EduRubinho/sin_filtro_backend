import { InvalidArgumentError } from '../../shared/domain/InvalidArgumentError.ts';
import { ConflictError } from '../../shared/domain/ConflictError.ts';
import { DomainError } from '../../shared/domain/DomainError.ts';

export const eventStatuses = ['draft', 'published', 'cancelled', 'completed'] as const;
export type EventStatus = typeof eventStatuses[number];
export interface EventInput {
  organizerId: string; categoryId: string; title: string; description: string;
  locationName: string; address: string | null; meetingDetails: string | null;
  latitude: number; longitude: number; startsAt: string; endsAt: string;
  timeZone: string; price: number; currency: string; capacity: number | null; status: EventStatus;
}
export interface Event extends EventInput {
  id: string; completedAt: string | null; createdAt: string; updatedAt: string;
}
export class EventNotFoundError extends DomainError {
  readonly code = 'EVENT_NOT_FOUND';
  constructor() { super('Evento no encontrado.'); }
}
export function eventId(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value) || value.length > 19 || BigInt(value) > 9223372036854775807n) {
    throw new InvalidArgumentError('El ID debe ser un entero positivo válido, enviado como texto.');
  }
  return value;
}
const fields = ['organizerId', 'categoryId', 'title', 'description', 'locationName', 'address', 'meetingDetails',
  'latitude', 'longitude', 'startsAt', 'endsAt', 'timeZone', 'price', 'currency', 'capacity', 'status'];
function body(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.keys(input).length ||
    Object.keys(input).some(key => !fields.includes(key))) throw new InvalidArgumentError('Campos de evento inválidos.');
  return input as Record<string, unknown>;
}
function text(value: unknown, name: string, max: number, empty = false): string {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.trim().length > max) {
    throw new InvalidArgumentError(`${name}: texto ${empty ? 'de 0' : 'de 1'} a ${max} caracteres.`);
  }
  return value.trim();
}
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new InvalidArgumentError('Las fechas deben ser ISO 8601 con zona horaria, por ejemplo 2027-01-01T17:00:00-05:00.');
  }
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) throw new InvalidArgumentError('Fecha inválida.');
  return new Date(value).toISOString();
}
function validate(input: Record<string, unknown>): EventInput {
  const v = input;
  const latitude = v.latitude, longitude = v.longitude;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
    typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180) throw new InvalidArgumentError('Coordenadas inválidas.');
  const startsAt = timestamp(v.startsAt), endsAt = timestamp(v.endsAt);
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new InvalidArgumentError('La fecha de fin debe ser posterior al inicio.');
  const timeZone = text(v.timeZone, 'timeZone', 100);
  try { new Intl.DateTimeFormat('es', { timeZone }); } catch { throw new InvalidArgumentError('Zona horaria inválida.'); }
  const price = v.price;
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 99999999.99 || Math.abs(price * 100 - Math.round(price * 100)) > 0.00001) {
    throw new InvalidArgumentError('price debe ser un número no negativo con hasta dos decimales.');
  }
  const currency = text(v.currency, 'currency', 3);
  if (!/^[A-Z]{3}$/.test(currency)) throw new InvalidArgumentError('currency debe tener tres letras mayúsculas.');
  const capacity = v.capacity;
  if (capacity !== null && (typeof capacity !== 'number' || !Number.isInteger(capacity) || capacity < 1 || capacity > 2147483647)) throw new InvalidArgumentError('capacity debe ser un entero positivo o null.');
  if (!eventStatuses.includes(v.status as EventStatus)) throw new InvalidArgumentError('Estado de evento inválido.');
  return { organizerId: eventId(v.organizerId), categoryId: eventId(v.categoryId), title: text(v.title, 'title', 140),
    description: text(v.description, 'description', 4000, true), locationName: text(v.locationName, 'locationName', 160),
    address: v.address === null ? null : text(v.address, 'address', 500, true),
    meetingDetails: v.meetingDetails === null ? null : text(v.meetingDetails, 'meetingDetails', 250, true),
    latitude, longitude, startsAt, endsAt, timeZone, price, currency, capacity: capacity as number | null, status: v.status as EventStatus };
}
export function createEventInput(input: unknown, now = Date.now()): EventInput {
  const v = validate({ description: '', address: null, meetingDetails: null, timeZone: 'America/Lima', price: 0, currency: 'PEN', capacity: null, status: 'draft', ...body(input) });
  if (!['draft', 'published'].includes(v.status)) throw new InvalidArgumentError('Un evento nuevo debe estar en draft o published.');
  if (Date.parse(v.startsAt) <= now) throw new InvalidArgumentError('El evento debe empezar en el futuro.');
  return v;
}
export function createPublishedEventInput(input: unknown, organizerId: string, now = Date.now()): EventInput {
  const supplied = body(input);
  if ('organizerId' in supplied || 'status' in supplied) {
    throw new InvalidArgumentError('El organizador y el estado se obtienen de la sesión del usuario.');
  }
  return createEventInput({ ...supplied, organizerId, status: 'published' }, now);
}
export function patchEventInput(current: Event, input: unknown, now = Date.now()): EventInput {
  const patch = body(input);
  if ('organizerId' in patch) throw new InvalidArgumentError('El organizador no puede cambiarse desde este endpoint.');
  const v = validate({ ...current, ...patch });
  if (['cancelled', 'completed'].includes(current.status) && v.status !== current.status) throw new ConflictError('Un evento cerrado no puede reabrirse.');
  if (current.status === 'published' && v.status === 'draft') throw new ConflictError('Un evento publicado no puede volver a borrador.');
  if (v.status === 'completed' && (current.status === 'draft' || Date.parse(current.startsAt) > now)) throw new ConflictError('Solo se puede finalizar un evento publicado que ya comenzó.');
  if (Date.parse(current.startsAt) <= now || ['cancelled', 'completed'].includes(current.status)) {
    for (const key of ['startsAt', 'endsAt', 'latitude', 'longitude', 'locationName', 'address', 'meetingDetails'] as const) {
      if (v[key] !== current[key]) throw new ConflictError('El lugar y horario quedan fijos después del inicio o cierre.');
    }
  } else if (Date.parse(v.startsAt) <= now) throw new InvalidArgumentError('El inicio debe permanecer en el futuro.');
  if (current.status === 'draft' && v.status === 'published' && Date.parse(v.startsAt) <= now) throw new ConflictError('No se puede publicar un evento cuyo inicio ya pasó.');
  return v;
}
export function eventPagination(limit: unknown = '50', offset: unknown = '0') {
  if (typeof limit !== 'string' || !/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100 ||
    typeof offset !== 'string' || !/^\d+$/.test(offset) || !Number.isSafeInteger(Number(offset))) throw new InvalidArgumentError('limit: 1–100; offset: entero no negativo.');
  return { limit: Number(limit), offset: Number(offset) };
}
