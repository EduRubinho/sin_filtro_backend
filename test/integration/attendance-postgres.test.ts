import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Client, Pool } from 'pg';
import { ActivityAttendance } from '../../src/event/application/ActivityAttendance.ts';
import { PostgresAttendanceRepository } from '../../src/event/infrastructure/PostgresAttendanceRepository.ts';
import { AttendancePin } from '../../src/event/infrastructure/AttendancePin.ts';
import { PostgresEventRepository } from '../../src/event/infrastructure/PostgresEventRepository.ts';
import { createEventInput } from '../../src/event/domain/Event.ts';

// Base desechable exclusiva de esta prueba: nunca crea datos en DATABASE_URL.
test('asistencia real: permisos, horarios, PIN compartido, rotación, revocación y bloqueo concurrente', { skip: process.env.RUN_POSTGRES_TESTS !== '1' }, async () => {
  const dbName = `sinfiltro_attendance_test_${randomBytes(8).toString('hex')}`;
  const admin = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  const url = new URL(process.env.DATABASE_URL!); url.pathname = `/${dbName}`;
  const pool = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
  let created = false;
  try {
    await admin.connect(); await admin.query(`CREATE DATABASE "${dbName}"`); created = true;
    await pool.query(await readFile(new URL('../../docs/database/schema.sql', import.meta.url), 'utf8'));
    await pool.query(`INSERT INTO public.users(email,password_hash,role) VALUES
      ('owner@test.com','hash','user'),('one@test.com','hash','user'),('two@test.com','hash','user'),
      ('outsider@test.com','hash','user'),('admin@test.com','hash','admin')`);
    const category = (await pool.query('SELECT id FROM public.categories LIMIT 1')).rows[0].id;
    const client = await pool.connect();
    let id: string;
    try {
      await client.query('BEGIN');
      id = (await client.query(`INSERT INTO public.activities(organizer_id,category_id,title,location_name,location,starts_at,ends_at,status)
        VALUES(1,$1,'Prueba asistencia','Tacna',ST_SetSRID(ST_MakePoint(-70,-18),4326)::geography,
        clock_timestamp()+interval '5 minutes',clock_timestamp()+interval '1 hour','published') RETURNING id::text`, [category])).rows[0].id;
      await client.query('INSERT INTO public.activity_participants(activity_id,user_id) VALUES($1,1),($1,2),($1,3),($1,5)', [id]);
      await client.query('COMMIT');
    } finally { client.release(); }
    class FixedPins extends AttendancePin {
      private sequence = 122;
      override generate() { return String(++this.sequence).padStart(6, '0'); }
    }
    const attendance = new ActivityAttendance(new PostgresAttendanceRepository(pool, new FixedPins('ab'.repeat(32))));
    const rejected = async (action: Promise<unknown>, code: string) => assert.rejects(action, (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === code);
    const ageCode = () => pool.query("UPDATE public.activity_checkin_codes SET created_at=clock_timestamp()-interval '31 seconds' WHERE activity_id=$1", [id]);

    await rejected(attendance.info(id, '4'), 'FORBIDDEN');
    await rejected(attendance.info(id, '5'), 'FORBIDDEN');
    await rejected(attendance.issue(id, '2'), 'FORBIDDEN');
    const first = await attendance.issue(id, '1'); assert.equal(first.pin, '000123');
    assert.ok(Date.parse(first.expiresAt) <= Date.now() + 15 * 60_000);
    const stored = (await pool.query('SELECT pin_hash FROM public.activity_checkin_codes WHERE activity_id=$1', [id])).rows[0];
    assert.notEqual(stored.pin_hash, first.pin); assert.equal(stored.pin_hash.length, 64);
    assert.ok(!JSON.stringify(await attendance.info(id, '2')).includes(first.pin));
    await attendance.validate(id, '1', { pin: first.pin });
    assert.ok((await attendance.info(id, '1')).validatedAt);
    assert.equal((await attendance.info(id, '1')).confirmed, 0);
    await rejected(attendance.issue(id, '1'), 'RATE_LIMITED');

    // Cinco peticiones concurrentes deben persistir cinco fallos, no perder actualizaciones.
    const failures = await Promise.allSettled(Array.from({ length: 5 }, () => attendance.validate(id, '2', { pin: '999999' })));
    assert.ok(failures.every(r => r.status === 'rejected'));
    assert.equal((await pool.query('SELECT pin_failed_attempts FROM public.activity_participants WHERE activity_id=$1 AND user_id=2', [id])).rows[0].pin_failed_attempts, 5);
    await rejected(attendance.validate(id, '2', { pin: first.pin }), 'RATE_LIMITED');
    await ageCode(); const second = await attendance.issue(id, '1');
    await rejected(attendance.validate(id, '2', { pin: second.pin }), 'RATE_LIMITED');
    await pool.query("UPDATE public.activity_participants SET pin_locked_until=clock_timestamp()-interval '1 second' WHERE activity_id=$1 AND user_id=2", [id]);
    await rejected(attendance.validate(id, '2', { pin: first.pin }), 'INVALID_INPUT');
    assert.equal((await pool.query('SELECT pin_failed_attempts FROM public.activity_participants WHERE activity_id=$1 AND user_id=2', [id])).rows[0].pin_failed_attempts, 1);
    const confirmed = await attendance.validate(id, '2', { pin: second.pin });
    assert.deepEqual(await attendance.validate(id, '2', { pin: second.pin }), confirmed);
    await attendance.validate(id, '3', { pin: second.pin }); // mismo PIN para dos cuentas
    assert.equal((await attendance.info(id, '1')).confirmed, 2);
    const memberInfo = await attendance.info(id, '2');
    assert.equal(memberInfo.participants.filter(p => p.validatedAt).length, 2);
    assert.ok(memberInfo.participants.every(p => p.id !== '1')); // organizador separado

    await attendance.revoke(id, '1'); assert.equal((await attendance.info(id, '1')).codeExpiresAt, null);
    assert.equal((await attendance.info(id, '1')).confirmed, 2); // no revoca asistencias previas
    await pool.query('UPDATE public.activity_participants SET attendance_validated_at=NULL,attendance_code_id=NULL WHERE activity_id=$1 AND user_id=3', [id]);
    await rejected(attendance.validate(id, '3', { pin: second.pin }), 'CONFLICT');
    await ageCode(); const third = await attendance.issue(id, '1');
    await pool.query("UPDATE public.activity_checkin_codes SET valid_from=clock_timestamp()-interval '16 minutes',expires_at=clock_timestamp()-interval '1 second' WHERE activity_id=$1 AND revoked_at IS NULL", [id]);
    await rejected(attendance.validate(id, '3', { pin: third.pin }), 'CONFLICT');
    await pool.query("UPDATE public.activities SET starts_at=clock_timestamp()+interval '30 minutes' WHERE id=$1", [id]);
    assert.equal((await attendance.info(id, '1')).open, false);
    await rejected(attendance.issue(id, '1'), 'CONFLICT');
    await pool.query("UPDATE public.activities SET starts_at=clock_timestamp()-interval '1 minute',ends_at=clock_timestamp()+interval '2 minutes' WHERE id=$1", [id]);
    await ageCode(); const fourth = await attendance.issue(id, '1');
    assert.equal(fourth.expiresAt, (await attendance.info(id, '1')).closesAt);
    await pool.query("UPDATE public.activity_participants SET status='left' WHERE activity_id=$1 AND user_id=3", [id]);
    await rejected(attendance.validate(id, '3', { pin: fourth.pin }), 'FORBIDDEN');
    await pool.query("UPDATE public.activity_participants SET status='removed' WHERE activity_id=$1 AND user_id=3", [id]);
    await rejected(attendance.validate(id, '3', { pin: fourth.pin }), 'FORBIDDEN');
    await pool.query("UPDATE public.activity_participants SET status='joined' WHERE activity_id=$1 AND user_id=3", [id]);
    await pool.query("UPDATE public.activities SET status='cancelled' WHERE id=$1", [id]);
    await rejected(attendance.validate(id, '3', { pin: fourth.pin }), 'CONFLICT');
    const events = new PostgresEventRepository(pool);
    const search = { latitude: -18, longitude: -70, radiusMeters: 500, phase: 'finished' as const };
    assert.equal((await events.findForMap({ ...search, viewerId: '4' })).activities.length, 0);
    assert.equal((await events.findForMap({ ...search, viewerId: '2' })).activities.length, 0); // cancelada
    assert.equal((await attendance.info(id, '1')).open, false);
    await pool.query("UPDATE public.activities SET status='published',ends_at=clock_timestamp()-interval '1 second' WHERE id=$1", [id]);
    await rejected(attendance.validate(id, '3', { pin: fourth.pin }), 'CONFLICT');
    assert.equal((await events.findForMap({ ...search, phase: 'active', viewerId: '2' })).activities.length, 0);
    assert.equal((await events.findForMap({ ...search, viewerId: '4' })).activities.length, 0);
    assert.equal((await events.findForMap({ ...search, viewerId: '3' })).activities.length, 0); // inscrito sin asistencia
    assert.equal((await events.findForMap({ ...search, viewerId: '2' })).activities[0].phase, 'finished');
    assert.equal((await events.findForMap({ ...search, viewerId: '1' })).activities.length, 1);
    const detail = await events.findDetail(id, '2');
    assert.deepEqual(detail?.album, { enabled: true, canView: true, canUpload: true });
    assert.deepEqual((await events.findDetail(id, '4'))?.album, { enabled: true, canView: false, canUpload: false });
    assert.equal((await pool.query('SELECT visibility FROM public.albums WHERE activity_id=$1', [id])).rows[0].visibility, 'private');
    await assert.rejects(events.update(id, { albumVisibility: 'public' }), { code: 'CONFLICT' });
    await assert.rejects(pool.query("UPDATE public.activities SET album_visibility='public' WHERE id=$1", [id]), { code: '23514' });
    await assert.rejects(pool.query("UPDATE public.albums SET visibility='public' WHERE activity_id=$1", [id]), { code: '23514' });
    await pool.query('UPDATE public.albums SET deleted_at=clock_timestamp() WHERE activity_id=$1', [id]);
    assert.equal((await events.findForMap({ ...search, viewerId: '2' })).activities.length, 0);
    assert.equal((await events.findDetail(id, '2'))?.album.enabled, false);
    const publicEvent = await events.create(createEventInput({ organizerId: '1', categoryId: String(category), title: 'Público',
      locationName: 'Tacna', latitude: -18, longitude: -70, albumVisibility: 'public', status: 'published',
      startsAt: new Date(Date.now()+3600000).toISOString(), endsAt: new Date(Date.now()+7200000).toISOString() }));
    await assert.rejects(pool.query(`INSERT INTO public.albums(activity_id,created_by,title,visibility)
      VALUES($1,1,'Prematuro','public')`, [publicEvent.id]), { code: '23514' });
    await events.join(publicEvent.id, '2'); // antes
    await pool.query("UPDATE public.activities SET starts_at=clock_timestamp()-interval '1 minute' WHERE id=$1", [publicEvent.id]);
    await events.join(publicEvent.id, '3'); // durante
    assert.equal((await events.findDetail(publicEvent.id, '3'))?.participantCount, 2);
    await pool.query("UPDATE public.activities SET ends_at=clock_timestamp()-interval '1 second' WHERE id=$1", [publicEvent.id]);
    await assert.rejects(events.join(publicEvent.id, '4'), { code: 'CONFLICT' });
    assert.equal((await events.findForMap({ ...search, viewerId: '4' })).activities[0].id, publicEvent.id);
    assert.deepEqual((await events.findDetail(publicEvent.id, '4'))?.album, { enabled: true, canView: true, canUpload: false });
  } finally {
    await pool.end();
    if (created) await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
    await admin.end();
  }
});
