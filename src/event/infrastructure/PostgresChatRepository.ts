import type { Pool, PoolClient } from 'pg';
import type { ChatInfo, ChatMessage, ChatPage } from '../domain/ActivityChat.ts';
import { ChatUnavailableError } from '../domain/ActivityChat.ts';
import type { ChatRepository } from '../domain/ChatRepository.ts';

type AccessRow = {
  activityId: string; activityTitle: string; organizerId: string; status: string;
  endsAt: Date; updatedAt: Date; participantStatus: string; now: Date;
};
type MessageRow = {
  id: string; activityId: string; body: string; createdAt: Date;
  senderId: string; displayName: string; organizerId: string;
};

function message(row: MessageRow): ChatMessage {
  return { id: row.id, activityId: row.activityId, body: row.body, createdAt: row.createdAt.toISOString(),
    sender: { id: row.senderId, displayName: row.displayName, avatarUrl: null, isOrganizer: row.senderId === row.organizerId } };
}

export class PostgresChatRepository implements ChatRepository {
  private readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  private async completeExpired(client: PoolClient, activityId: string) {
    await client.query(`UPDATE public.activities SET status='completed', completed_at=ends_at, updated_at=clock_timestamp()
      WHERE id=$1 AND status='published' AND deleted_at IS NULL AND ends_at<=clock_timestamp()`, [activityId]);
  }

  private async access(client: PoolClient, activityId: string, userId: string, lock = false): Promise<ChatInfo | null> {
    await this.completeExpired(client, activityId);
    const result = await client.query<AccessRow>(`SELECT a.id::text AS "activityId",a.title AS "activityTitle",
      a.organizer_id::text AS "organizerId",a.status,a.ends_at AS "endsAt",a.updated_at AS "updatedAt",
      participant.status AS "participantStatus",clock_timestamp() AS now
      FROM public.activities a JOIN public.activity_participants participant
        ON participant.activity_id=a.id AND participant.user_id=$2
      JOIN public.users member ON member.id=participant.user_id
      WHERE a.id=$1 AND a.deleted_at IS NULL AND member.status='active'
      ${lock ? 'FOR UPDATE OF a,participant' : ''}`, [activityId, userId]);
    const row = result.rows[0];
    if (!row || row.participantStatus !== 'joined') return null;
    if (row.status === 'draft') throw new ChatUnavailableError();
    const readOnly = row.status !== 'published';
    const base = row.status === 'cancelled' ? row.updatedAt : row.endsAt;
    const availableUntil = new Date(base.getTime() + 24 * 60 * 60 * 1000);
    if (row.now.getTime() >= availableUntil.getTime()) throw new ChatUnavailableError();
    const unread = await client.query<{ count: number }>(`SELECT count(*)::int AS count
      FROM public.activity_messages message
      JOIN public.activity_participants participant ON participant.activity_id=message.activity_id AND participant.user_id=$2
      WHERE message.activity_id=$1 AND message.deleted_at IS NULL AND message.sender_id<>$2
        AND message.created_at>COALESCE(participant.last_read_at,'-infinity'::timestamptz)`, [activityId, userId]);
    return { activityId: row.activityId, activityTitle: row.activityTitle, readOnly,
      availableUntil: availableUntil.toISOString(), unreadCount: unread.rows[0].count };
  }

  info(activityId: string, userId: string): Promise<ChatInfo | null> {
    return this.transaction(client => this.access(client, activityId, userId));
  }

  history(activityId: string, userId: string, beforeId: string | null, limit: number): Promise<ChatPage | null> {
    return this.transaction(async client => {
      const chat = await this.access(client, activityId, userId);
      if (!chat) return null;
      const result = await client.query<MessageRow>(`SELECT message.id::text,message.activity_id::text AS "activityId",
        message.body,message.created_at AS "createdAt",sender.id::text AS "senderId",
        COALESCE(NULLIF(BTRIM(sender.display_name),''),split_part(sender.email,'@',1)) AS "displayName",
        activity.organizer_id::text AS "organizerId"
        FROM public.activity_messages message
        JOIN public.users sender ON sender.id=message.sender_id
        JOIN public.activities activity ON activity.id=message.activity_id
        WHERE message.activity_id=$1 AND message.deleted_at IS NULL AND ($2::bigint IS NULL OR message.id<$2)
        ORDER BY message.id DESC LIMIT $3`, [activityId, beforeId, limit + 1]);
      const hasMore = result.rows.length > limit;
      return { chat, messages: result.rows.slice(0, limit).reverse().map(message), hasMore };
    });
  }

  send(activityId: string, userId: string, body: string): Promise<ChatMessage | null> {
    return this.transaction(async client => {
      const chat = await this.access(client, activityId, userId, true);
      if (!chat) return null;
      if (chat.readOnly) throw new ChatUnavailableError();
      const result = await client.query<MessageRow>(`WITH inserted AS (
        INSERT INTO public.activity_messages(activity_id,sender_id,body) VALUES($1,$2,$3)
        RETURNING id,activity_id,sender_id,body,created_at
      ) SELECT inserted.id::text,inserted.activity_id::text AS "activityId",inserted.body,
        inserted.created_at AS "createdAt",sender.id::text AS "senderId",
        COALESCE(NULLIF(BTRIM(sender.display_name),''),split_part(sender.email,'@',1)) AS "displayName",
        activity.organizer_id::text AS "organizerId"
        FROM inserted JOIN public.users sender ON sender.id=inserted.sender_id
        JOIN public.activities activity ON activity.id=inserted.activity_id`, [activityId, userId, body]);
      return message(result.rows[0]);
    });
  }

  markRead(activityId: string, userId: string, messageId: string): Promise<boolean> {
    return this.transaction(async client => {
      const chat = await this.access(client, activityId, userId, true);
      if (!chat) return false;
      const result = await client.query(`UPDATE public.activity_participants participant
        SET last_read_at=GREATEST(COALESCE(participant.last_read_at,'-infinity'::timestamptz),message.created_at),
          updated_at=clock_timestamp()
        FROM public.activity_messages message
        WHERE participant.activity_id=$1 AND participant.user_id=$2 AND participant.status='joined'
          AND message.id=$3 AND message.activity_id=participant.activity_id AND message.deleted_at IS NULL`, [activityId, userId, messageId]);
      return result.rowCount === 1;
    });
  }

  async activeMemberIds(activityId: string): Promise<string[]> {
    const result = await this.pool.query<{ id: string }>(`SELECT participant.user_id::text AS id
      FROM public.activity_participants participant JOIN public.users member ON member.id=participant.user_id
      JOIN public.activities activity ON activity.id=participant.activity_id
      WHERE participant.activity_id=$1 AND participant.status='joined' AND member.status='active'
        AND activity.deleted_at IS NULL`, [activityId]);
    return result.rows.map(row => row.id);
  }

  async purgeExpired(): Promise<number> {
    const result = await this.pool.query(`DELETE FROM public.activity_messages message USING public.activities activity
      WHERE message.activity_id=activity.id AND (
        (activity.status='completed' AND activity.ends_at<clock_timestamp()-interval '7 days') OR
        (activity.status='cancelled' AND activity.updated_at<clock_timestamp()-interval '7 days')
      )`);
    return result.rowCount ?? 0;
  }
}
