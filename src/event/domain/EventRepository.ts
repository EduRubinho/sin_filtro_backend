import type { MapSearch, MapActivities } from './MapActivity.ts';
import type { Event, EventInput } from './Event.ts';
export interface EventRepository {
  findForMap(search: MapSearch): Promise<MapActivities>;
  create(input: EventInput): Promise<Event>;
  findAll(limit: number, offset: number): Promise<Event[]>;
  findById(id: string): Promise<Event | null>;
  // El adaptador bloquea la fila antes de validar y aplicar el PATCH.
  update(id: string, input: unknown): Promise<Event | null>;
  delete(id: string): Promise<boolean>;
}
