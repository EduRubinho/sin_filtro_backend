import { attendancePin, type AttendanceRepository } from '../domain/Attendance.ts';
import { eventId } from '../domain/Event.ts';

export class ActivityAttendance {
  private readonly repository: AttendanceRepository;
  constructor(repository: AttendanceRepository) { this.repository = repository; }
  info(id: unknown, userId: string) { return this.repository.info(eventId(id), eventId(userId)); }
  issue(id: unknown, userId: string) { return this.repository.issue(eventId(id), eventId(userId)); }
  revoke(id: unknown, userId: string) { return this.repository.revoke(eventId(id), eventId(userId)); }
  validate(id: unknown, userId: string, input: unknown) {
    return this.repository.validate(eventId(id), eventId(userId), attendancePin(input));
  }
}
