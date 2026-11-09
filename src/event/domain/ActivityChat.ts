import { ConflictError } from '../../shared/domain/ConflictError.ts';
import { DomainError } from '../../shared/domain/DomainError.ts';
import { InvalidArgumentError } from '../../shared/domain/InvalidArgumentError.ts';
import { eventId } from './Event.ts';

export interface ChatInfo {
  activityId: string;
  activityTitle: string;
  readOnly: boolean;
  availableUntil: string;
  unreadCount: number;
}

export interface ChatMessage {
  id: string;
  activityId: string;
  body: string;
  createdAt: string;
  sender: { id: string; displayName: string; avatarUrl: null; isOrganizer: boolean };
}

export interface ChatPage {
  chat: ChatInfo;
  messages: ChatMessage[];
  hasMore: boolean;
}

export class ChatAccessError extends DomainError {
  readonly code = 'FORBIDDEN';
  constructor() { super('Solo el organizador y los participantes inscritos pueden acceder al chat.'); }
}

export class ChatUnavailableError extends ConflictError {
  constructor() { super('El chat temporal ya no está disponible.'); }
}

export function chatActivityId(value: unknown) { return eventId(value); }

export function chatMessageId(value: unknown): string {
  return eventId(value);
}

export function chatPagination(input: Record<string, unknown>) {
  if (Object.keys(input).some(key => !['beforeId', 'limit'].includes(key))) throw new InvalidArgumentError('Parámetros de chat inválidos.');
  const limitValue = input.limit ?? '30';
  if (typeof limitValue !== 'string' || !/^\d+$/.test(limitValue) || Number(limitValue) < 1 || Number(limitValue) > 50) {
    throw new InvalidArgumentError('limit debe estar entre 1 y 50.');
  }
  const beforeId = input.beforeId === undefined ? null : chatMessageId(input.beforeId);
  return { beforeId, limit: Number(limitValue) };
}

export function chatBody(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || !('body' in input)) {
    throw new InvalidArgumentError('Envía únicamente el texto del mensaje.');
  }
  const value = (input as { body?: unknown }).body;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 1000) {
    throw new InvalidArgumentError('El mensaje debe tener entre 1 y 1000 caracteres.');
  }
  return value.trim();
}
