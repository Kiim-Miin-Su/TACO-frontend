import type { EventType } from '@/types';
import type { Tone } from '@/components/ui';

export const eventLabel: Record<EventType, string> = {
  notice: '공지', exam: '시험', holiday: '휴원', closure: '휴강', event: '행사',
};
export const eventTone: Record<EventType, Tone> = {
  notice: 'accent', exam: 'done', holiday: 'danger', closure: 'attention', event: 'success',
};
export const EVENT_TYPES: EventType[] = ['notice', 'exam', 'holiday', 'closure', 'event'];
