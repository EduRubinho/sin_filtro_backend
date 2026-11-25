import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { AttendanceError, type AttendanceRepository, type AttendanceInfo } from '../domain/Attendance.ts';
import { AttendancePin } from './AttendancePin.ts';

type Activity = { organizer_id: string; status: string; starts_at: Date; ends_at: Date };
type Member = { attendance_validated_at: Date | null; attendance_revoked_at: Date | null;
  pin_failed_attempts: number; pin_locked_until: Date | null };
type Code = { id: string; pin_hash: string; valid_from: Date; expires_at: Date; created_at: Date };

export class PostgresAttendanceRepository implements AttendanceRepository {
  private readonly pool: Pool;
  private readonly pins: AttendancePin;
  constructor(pool: Pool, pins: AttendancePin) { this.pool = pool; this.pins = pins; }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const value = await work(client); await client.query('COMMIT'); return value; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  // Mismo bloqueo de actividad que edición/cancelación/inscripción: serializa los cambios concurrentes.
  private async access(client: PoolClient, id: string, userId: string, organizerOnly = false) {
    const result = await client.query<Activity>(`SELECT organizer_id::text,status,starts_at,ends_at
      FROM public.activities WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [id]);
    const activity = result.rows[0];
    if (!activity) throw new AttendanceError('Actividad no disponible.', 'EVENT_NOT_FOUND');
    const members = await client.query<Member>(`SELECT p.attendance_validated_at,p.attendance_revoked_at,p.pin_failed_attempts,p.pin_locked_until
      FROM public.activity_participants p JOIN public.users u ON u.id=p.user_id
      WHERE p.activity_id=$1 AND p.user_id=$2 AND p.status='joined' AND u.status='active' AND u.role='user'
      FOR UPDATE OF p`, [id, userId]);
    if (!members.rows[0] || (organizerOnly && activity.organizer_id !== userId)) {
      throw new AttendanceError('Solo los inscritos pueden consultar su asistencia; únicamente el organizador gestiona el PIN.', 'FORBIDDEN');
    }
    return { activity, member: members.rows[0], organizer: activity.organizer_id === userId };
  }
  private async now(client: PoolClient): Promise<Date> {
    return (await client.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0].now;
  }
  private window(activity: Activity, now: Date) {
    return activity.status === 'published' && now.getTime() >= activity.starts_at.getTime() - 15 * 60_000 && now < activity.ends_at;
  }
  private async currentCode(client: PoolClient, id: string) {
    return (await client.query<Code>(`SELECT id,pin_hash,valid_from,expires_at,created_at
      FROM public.activity_checkin_codes WHERE activity_id=$1 AND revoked_at IS NULL FOR UPDATE`, [id])).rows[0];
  }
  info(id: string, userId: string): Promise<AttendanceInfo> {
    return this.transaction(async client => {
      const { activity, member, organizer } = await this.access(client, id, userId);
      const code = await this.currentCode(client, id);
      const now = await this.now(client);
      const participants = (await client.query<{ id: string; displayName: string; validatedAt: Date | null }>(`
        SELECT u.id::text,COALESCE(NULLIF(u.display_name,''),split_part(u.email,'@',1)) AS "displayName",
          CASE WHEN p.attendance_revoked_at IS NULL THEN p.attendance_validated_at END AS "validatedAt"
        FROM public.activity_participants p JOIN public.users u ON u.id=p.user_id
        WHERE p.activity_id=$1 AND p.status='joined' AND p.user_id<>$2 ORDER BY p.joined_at,p.user_id`, [id, activity.organizer_id])).rows;
      const confirmed = participants.filter(p => p.validatedAt).length;
      const open = this.window(activity, now);
      return { opensAt: new Date(activity.starts_at.getTime() - 15 * 60_000).toISOString(), closesAt: activity.ends_at.toISOString(), open,
        isOrganizer: organizer, validatedAt: member.attendance_revoked_at ? null : member.attendance_validated_at?.toISOString() ?? null,
        lockedUntil: member.pin_locked_until && member.pin_locked_until > now ? member.pin_locked_until.toISOString() : null,
        codeExpiresAt: open && code && code.valid_from <= now && code.expires_at > now ? code.expires_at.toISOString() : null,
        enrolled: participants.length, confirmed, pending: participants.length - confirmed,
        participants: participants.map(p => ({ ...p, validatedAt: p.validatedAt?.toISOString() ?? null })) };
    });
  }
  issue(id: string, userId: string) {
    return this.transaction(async client => {
      const { activity } = await this.access(client, id, userId, true);
      const previous = await this.currentCode(client, id);
      const now = await this.now(client);
      if (!this.window(activity, now)) throw new AttendanceError('La validación abre 15 minutos antes y cierra al finalizar o cancelar.');
      // También limita la emisión después de revocar: no depende de que exista un PIN activo.
      const latest = previous ?? (await client.query<Code>('SELECT created_at FROM public.activity_checkin_codes WHERE activity_id=$1 ORDER BY created_at DESC LIMIT 1', [id])).rows[0];
      if (latest && now.getTime() - latest.created_at.getTime() < 30_000) throw new AttendanceError('Espera 30 segundos antes de generar otro PIN.', 'RATE_LIMITED');
      await client.query('UPDATE public.activity_checkin_codes SET revoked_at=$2 WHERE activity_id=$1 AND revoked_at IS NULL', [id, now]);
      const pin = this.pins.generate(), codeId = randomUUID();
      const expiresAt = new Date(Math.min(now.getTime() + 15 * 60_000, activity.ends_at.getTime()));
      await client.query(`INSERT INTO public.activity_checkin_codes(id,activity_id,issued_by,pin_hash,created_at,valid_from,expires_at)
        VALUES($1,$2,$3,$4,$5,$5,$6)`, [codeId, id, userId, this.pins.hash(codeId, id, pin), now, expiresAt]);
      return { pin, expiresAt: expiresAt.toISOString() };
    });
  }
  revoke(id: string, userId: string) {
    return this.transaction(async client => {
      await this.access(client, id, userId, true);
      await client.query('UPDATE public.activity_checkin_codes SET revoked_at=clock_timestamp() WHERE activity_id=$1 AND revoked_at IS NULL', [id]);
    });
  }
  async validate(id: string, userId: string, pin: string) {
    const result = await this.transaction(async client => {
      const { activity, member } = await this.access(client, id, userId);
      if (member.attendance_validated_at && !member.attendance_revoked_at) return { validatedAt: member.attendance_validated_at.toISOString() };
      const code = await this.currentCode(client, id);
      const now = await this.now(client);
      if (!this.window(activity, now)) throw new AttendanceError('La validación de asistencia está cerrada.');
      if (member.pin_locked_until && member.pin_locked_until > now) throw new AttendanceError('Demasiados intentos. Espera 15 minutos.', 'RATE_LIMITED');
      if (!code || code.valid_from > now || code.expires_at <= now) throw new AttendanceError('No hay un PIN vigente. Solicítalo al organizador.');
      if (!this.pins.matches(code.id, id, pin, code.pin_hash)) {
        const attempts = (member.pin_locked_until ? 0 : member.pin_failed_attempts) + 1;
        await client.query(`UPDATE public.activity_participants SET pin_failed_attempts=$3,pin_locked_until=$4,updated_at=$5
          WHERE activity_id=$1 AND user_id=$2`, [id, userId, attempts, attempts >= 5 ? new Date(now.getTime() + 15 * 60_000) : null, now]);
        // El error se lanza DESPUÉS del COMMIT: no deshacer el contador de fallos.
        return { failure: attempts >= 5 ? 'RATE_LIMITED' : 'INVALID_INPUT' };
      }
      await client.query(`UPDATE public.activity_participants SET attendance_validated_at=$3,attendance_code_id=$4,
        attendance_revoked_at=NULL,pin_failed_attempts=0,pin_locked_until=NULL,updated_at=$3 WHERE activity_id=$1 AND user_id=$2`, [id, userId, now, code.id]);
      return { validatedAt: now.toISOString() };
    });
    if ('failure' in result) throw new AttendanceError(result.failure === 'RATE_LIMITED' ? 'Demasiados intentos. Espera 15 minutos.' : 'PIN incorrecto.', result.failure);
    return result;
  }
}
