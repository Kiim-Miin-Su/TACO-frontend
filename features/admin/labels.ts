import type { EventType, EventPriority } from '@/types';
import type { Tone } from '@/components/ui';

export const eventLabel: Record<EventType, string> = {
  notice: '공지', exam: '시험', holiday: '휴원', closure: '휴강', event: '행사',
};
export const eventTone: Record<EventType, Tone> = {
  notice: 'accent', exam: 'done', holiday: 'danger', closure: 'attention', event: 'success',
};
export const EVENT_TYPES: EventType[] = ['notice', 'exam', 'holiday', 'closure', 'event'];

// 캘린더 칩 색상 (배경/글자)
export const eventStyle: Record<EventType, { bg: string; fg: string }> = {
  notice: { bg: 'var(--color-accent-subtle)', fg: 'var(--color-accent)' },
  exam: { bg: 'var(--color-done-subtle)', fg: 'var(--color-done)' },
  holiday: { bg: 'var(--color-danger-subtle)', fg: 'var(--color-danger)' },
  closure: { bg: 'var(--color-attention-subtle)', fg: 'var(--color-attention)' },
  event: { bg: 'var(--color-success-subtle)', fg: 'var(--color-success)' },
};

export const priorityLabel: Record<EventPriority, string> = { low: '낮음', normal: '보통', high: '중요' };
export const EVENT_PRIORITIES: EventPriority[] = ['high', 'normal', 'low'];
