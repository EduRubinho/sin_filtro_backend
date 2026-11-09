import type { EventStatus } from './Event.ts';

export type PlanStatus = Exclude<EventStatus, 'draft'>;
export type PlanRelation = 'organizer' | 'participant';

export interface UserPlan {
  id: string;
  title: string;
  locationName: string;
  categoryName: string;
  startsAt: string;
  endsAt: string;
  status: PlanStatus;
  capacity: number | null;
  participantCount: number;
  relation: PlanRelation;
  chatAvailable: boolean;
  chatReadOnly: boolean;
  unreadCount: number;
}

export interface UserPlans {
  organized: UserPlan[];
  participating: UserPlan[];
}
