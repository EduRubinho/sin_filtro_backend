import type { MapSearch, MapActivity, MapActivities } from '../domain/MapActivity.ts';
import type { Pool, PoolClient } from 'pg';
import type { EventRepository } from '../domain/EventRepository.ts';
import { patchEventInput, type Event, type EventInput } from '../domain/Event.ts';
import { InvalidArgumentError } from '../../shared/domain/InvalidArgumentError.ts';
import { ConflictError } from '../../shared/domain/ConflictError.ts';

const columns = `id::text, organizer_id::text AS "organizerId", category_id::text AS "categoryId",
 title, description, location_name AS "locationName", address, meeting_details AS "meetingDetails",
 ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude,
 starts_at AS "startsAt", ends_at AS "endsAt", time_zone AS "timeZone", price::float8,
 currency, capacity, status, completed_at AS "completedAt", created_at AS "createdAt", updated_at AS "updatedAt"`;
type Row = Omit<Event, 'startsAt' | 'endsAt' | 'completedAt' | 'createdAt' | 'updatedAt'> & {
  startsAt: Date; endsAt: Date; completedAt: Date | null; createdAt: Date; updatedAt: Date;
};
function map(row: Row): Event {
  return { ...row, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
function values(v: EventInput) {
  return [v.organizerId, v.categoryId, v.title, v.description, v.locationName, v.address, v.meetingDetails,
    v.longitude, v.latitude, v.startsAt, v.endsAt, v.timeZone, v.price, v.currency, v.capacity, v.status];
}
export class PostgresEventRepository implements EventRepository {
  private readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }
  async findForMap(search: MapSearch): Promise<MapActivities> {
    const result = await this.pool.query<Omit<MapActivity, 'startsAt' | 'endsAt'> & { startsAt: Date; endsAt: Date }>(`
      SELECT a.id::text, a.title, a.description, a.location_name AS "locationName", c.name AS "categoryName",
        ST_Y(a.location::geometry) AS latitude, ST_X(a.location::geometry) AS longitude,
        a.starts_at AS "startsAt", a.ends_at AS "endsAt", a.time_zone AS "timeZone", a.price::float8, a.currency,
        ST_Distance(a.location, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS "distanceMeters"
      FROM public.activities a JOIN public.categories c ON c.id=a.category_id
      WHERE a.status='published' AND a.deleted_at IS NULL AND a.ends_at > CURRENT_TIMESTAMP
        AND ST_DWithin(a.location, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)
      ORDER BY "distanceMeters", a.id LIMIT 101`, [search.longitude, search.latitude, search.radiusMeters]);
    return { activities: result.rows.slice(0, 100).map(row => ({ ...row, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() })), hasMore: result.rows.length > 100 };
  }
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
  private async category(client: PoolClient, id: string) {
    const result = await client.query('SELECT id FROM public.categories WHERE id = $1 AND is_active = TRUE FOR SHARE', [id]);
    if (!result.rowCount) throw new InvalidArgumentError('La categoría no existe o está inactiva.');
  }
  create(input: EventInput): Promise<Event> {
    return this.transaction(async client => {
      // El organizador siempre es una cuenta user activa, venga del administrador o de la propia sesión.
      const organizer = await client.query("SELECT id FROM public.users WHERE id = $1 AND role = 'user' AND status = 'active' FOR SHARE", [input.organizerId]);
      if (!organizer.rowCount) throw new InvalidArgumentError('El organizador debe ser un usuario con rol user y estado active.');
      await this.category(client, input.categoryId);
      const result = await client.query<Row>(`INSERT INTO public.activities
        (organizer_id, category_id, title, description, location_name, address, meeting_details, location,
         starts_at, ends_at, time_zone, price, currency, capacity, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,ST_SetSRID(ST_MakePoint($8,$9),4326)::geography,$10,$11,$12,$13,$14,$15,$16)
        RETURNING ${columns}`, values(input));
      const event = map(result.rows[0]);
      await client.query('INSERT INTO public.activity_participants (activity_id, user_id) VALUES ($1,$2)', [event.id, input.organizerId]);
      return event;
    });
  }
  async findAll(limit: number, offset: number): Promise<Event[]> {
    const result = await this.pool.query<Row>(`SELECT ${columns} FROM public.activities WHERE deleted_at IS NULL ORDER BY id DESC LIMIT $1 OFFSET $2`, [limit, offset]);
    return result.rows.map(map);
  }
  async findById(id: string): Promise<Event | null> {
    const result = await this.pool.query<Row>(`SELECT ${columns} FROM public.activities WHERE id = $1 AND deleted_at IS NULL`, [id]);
    return result.rows[0] ? map(result.rows[0]) : null;
  }
  update(id: string, input: unknown): Promise<Event | null> {
    return this.transaction(async client => {
      const current = await client.query<Row>(`SELECT ${columns} FROM public.activities WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id]);
      if (!current.rows[0]) return null;
      const previous = map(current.rows[0]);
      const next = patchEventInput(previous, input);
      if (next.categoryId !== previous.categoryId) await this.category(client, next.categoryId);
      const count = await client.query<{ count: string }>("SELECT count(*) FROM public.activity_participants WHERE activity_id = $1 AND status = 'joined'", [id]);
      if (next.capacity !== null && next.capacity < Number(count.rows[0].count)) throw new ConflictError('El cupo no puede ser menor que el número de participantes inscritos.');
      const result = await client.query<Row>(`UPDATE public.activities SET
        category_id=$2,title=$3,description=$4,location_name=$5,address=$6,meeting_details=$7,
        location=ST_SetSRID(ST_MakePoint($8,$9),4326)::geography, starts_at=$10,ends_at=$11,time_zone=$12,
        price=$13,currency=$14,capacity=$15,status=$16,
        completed_at=CASE WHEN $16='completed' THEN COALESCE(completed_at,clock_timestamp()) ELSE NULL END,
        updated_at=clock_timestamp() WHERE id=$17 AND organizer_id=$1 RETURNING ${columns}`, [...values(next), id]);
      return map(result.rows[0]);
    });
  }
  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query('UPDATE public.activities SET deleted_at=clock_timestamp(), updated_at=clock_timestamp() WHERE id=$1 AND deleted_at IS NULL', [id]);
    return result.rowCount === 1;
  }
}
