import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/** El secreto vive fuera de PostgreSQL. Un volcado de la BD no permite enumerar los seis dígitos. */
export class AttendancePin {
  private readonly secret: string;
  constructor(secret: string) {
    if (!/^[a-f0-9]{64}$/i.test(secret)) throw new Error('ATTENDANCE_PIN_SECRET debe tener 64 caracteres hexadecimales.');
    this.secret = secret;
  }
  generate() { return String(randomInt(0, 1_000_000)).padStart(6, '0'); }
  hash(codeId: string, activityId: string, pin: string) {
    return createHmac('sha256', Buffer.from(this.secret, 'hex')).update(JSON.stringify([codeId, activityId, pin])).digest('hex');
  }
  matches(codeId: string, activityId: string, pin: string, hash: string) {
    const expected = Buffer.from(hash, 'hex');
    const actual = Buffer.from(this.hash(codeId, activityId, pin), 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
