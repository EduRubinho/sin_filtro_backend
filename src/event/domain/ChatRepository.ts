import type { ChatInfo, ChatMessage, ChatPage } from './ActivityChat.ts';

export interface ChatRepository {
  info(activityId: string, userId: string): Promise<ChatInfo | null>;
  history(activityId: string, userId: string, beforeId: string | null, limit: number): Promise<ChatPage | null>;
  send(activityId: string, userId: string, body: string): Promise<ChatMessage | null>;
  markRead(activityId: string, userId: string, messageId: string): Promise<boolean>;
  activeMemberIds(activityId: string): Promise<string[]>;
  purgeExpired(): Promise<number>;
}
