import { ChatAccessError, chatActivityId, chatBody, chatMessageId, chatPagination } from '../domain/ActivityChat.ts';
import type { ChatRepository } from '../domain/ChatRepository.ts';

export class ActivityChat {
  private readonly chats: ChatRepository;
  constructor(chats: ChatRepository) { this.chats = chats; }

  async info(activityId: unknown, userId: string) {
    const info = await this.chats.info(chatActivityId(activityId), chatActivityId(userId));
    if (!info) throw new ChatAccessError();
    return info;
  }

  async history(activityId: unknown, userId: string, query: Record<string, unknown>) {
    const page = chatPagination(query);
    const result = await this.chats.history(chatActivityId(activityId), chatActivityId(userId), page.beforeId, page.limit);
    if (!result) throw new ChatAccessError();
    return result;
  }

  async send(activityId: unknown, userId: string, input: unknown) {
    const message = await this.chats.send(chatActivityId(activityId), chatActivityId(userId), chatBody(input));
    if (!message) throw new ChatAccessError();
    return message;
  }

  async markRead(activityId: unknown, userId: string, messageId: unknown) {
    if (!await this.chats.markRead(chatActivityId(activityId), chatActivityId(userId), chatMessageId(messageId))) {
      throw new ChatAccessError();
    }
  }

  activeMemberIds(activityId: string) { return this.chats.activeMemberIds(chatActivityId(activityId)); }
  purgeExpired() { return this.chats.purgeExpired(); }
}
