import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attendancePin } from '../../src/event/domain/Attendance.ts';
import { AttendancePin } from '../../src/event/infrastructure/AttendancePin.ts';

test('PIN conserva ceros iniciales y rechaza campos o formatos inválidos', () => {
  assert.equal(attendancePin({ pin: '001234' }), '001234');
  for (const input of [null, {}, { pin: 123456 }, { pin: '12345' }, { pin: '1234567' }, { pin: '12345a' }, { pin: '123456', userId: '2' }]) {
    assert.throws(() => attendancePin(input));
  }
});
test('HMAC vincula PIN con generación, evento y secreto', () => {
  const pins = new AttendancePin('ab'.repeat(32));
  const hash = pins.hash('generation1', '1', '001234');
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.ok(pins.matches('generation1', '1', '001234', hash));
  assert.ok(!pins.matches('generation2', '1', '001234', hash));
  assert.ok(!pins.matches('generation1', '2', '001234', hash));
  assert.ok(!pins.matches('generation1', '1', '001235', hash));
  assert.ok(!new AttendancePin('cd'.repeat(32)).matches('generation1', '1', '001234', hash));
  assert.ok(!pins.matches('generation1', '1', '001234', 'invalid'));
  assert.throws(() => new AttendancePin('short'));
  for (let i = 0; i < 100; i++) assert.match(pins.generate(), /^\d{6}$/);
});
