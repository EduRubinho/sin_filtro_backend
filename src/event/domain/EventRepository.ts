import type { MapSearch, MapActivities } from './MapActivity.ts';
import type { ActivityDetail, ActivityParticipant, Event, EventInput } from './Event.ts';
import type { UserPlans } from './UserPlan.ts';
export interface EventRepository {
  findForMap(search: MapSearch): Promise<MapActivities>;
  findPlans(userId: string): Promise<UserPlans>;
  create(input: EventInput): Promise<Event>;
  findAll(limit: number, offset: number): Promise<Event[]>;
  findById(id: string): Promise<Event | null>;
  findDetail(id: string, viewerId: string): Promise<ActivityDetail | null>;
  findParticipants(id: string, viewerId: string): Promise<ActivityParticipant[] | null>;
  join(id: string, userId: string): Promise<ActivityDetail | null>;
  leave(id: string, userId: string): Promise<ActivityDetail | null>;
  updateOwned(id: string, organizerId: string, input: unknown): Promise<ActivityDetail | null>;
  cancelOwned(id: string, organizerId: string): Promise<ActivityDetail | null>;
  // El adaptador bloquea la fila antes de validar y aplicar el PATCH.
  update(id: string, input: unknown): Promise<Event | null>;
  delete(id: string): Promise<boolean>;
}
