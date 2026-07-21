import type { AvailabilityBlock } from '@/types';

export type ScheduleEntryType = 'session' | 'available' | 'unavailable' | 'online_only';

export const SCHEDULE_ENTRY_OPTIONS: ReadonlyArray<{ value: ScheduleEntryType; label: string }> = [
  { value: 'session', label: '수업' },
  { value: 'available', label: '가능' },
  { value: 'unavailable', label: '불가' },
  { value: 'online_only', label: '온라인만 가능' },
] as const;

export function availabilityKindOf(type: Exclude<ScheduleEntryType, 'session'>): AvailabilityBlock['kind'] | 'online_only' {
  return type;
}
