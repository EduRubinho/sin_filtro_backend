import { mapSearch } from '../domain/MapActivity.ts';
import type { EventRepository } from '../domain/EventRepository.ts';
import { createEventInput, createPublishedEventInput, eventId, eventPagination, EventNotFoundError } from '../domain/Event.ts';
export class EventManagement {
  private readonly events: EventRepository;
  constructor(events: EventRepository) { this.events = events; }
  map(query: Record<string, unknown>) { return this.events.findForMap(mapSearch(query)); }
  create(input: unknown) { return this.events.create(createEventInput(input)); }
  createPublished(organizerId: string, input: unknown) { return this.events.create(createPublishedEventInput(input, organizerId)); }
  list(limit?: unknown, offset?: unknown) {
    const page = eventPagination(limit, offset);
    return this.events.findAll(page.limit, page.offset);
  }
  async get(id: unknown) {
    const event = await this.events.findById(eventId(id));
    if (!event) throw new EventNotFoundError();
    return event;
  }
  async detail(id: unknown, viewerId: string) {
    const event = await this.events.findDetail(eventId(id), eventId(viewerId));
    if (!event) throw new EventNotFoundError();
    return event;
  }
  async participants(id: unknown, viewerId: string) {
    const participants = await this.events.findParticipants(eventId(id), eventId(viewerId));
    if (!participants) throw new EventNotFoundError();
    return participants;
  }
  async join(id: unknown, userId: string) {
    const event = await this.events.join(eventId(id), eventId(userId));
    if (!event) throw new EventNotFoundError();
    return event;
  }
  async leave(id: unknown, userId: string) {
    const event = await this.events.leave(eventId(id), eventId(userId));
    if (!event) throw new EventNotFoundError();
    return event;
  }
  async updateOwned(id: unknown, organizerId: string, input: unknown) {
    const event = await this.events.updateOwned(eventId(id), eventId(organizerId), input);
    if (!event) throw new EventNotFoundError();
    return event;
  }
  async cancelOwned(id: unknown, organizerId: string) {
    const event = await this.events.cancelOwned(eventId(id), eventId(organizerId));
    if (!event) throw new EventNotFoundError();
    return event;
  }
  async update(id: unknown, input: unknown) {
    const event = await this.events.update(eventId(id), input);
    if (!event) throw new EventNotFoundError();
    return event;
  }
  async delete(id: unknown) {
    if (!await this.events.delete(eventId(id))) throw new EventNotFoundError();
  }
}
