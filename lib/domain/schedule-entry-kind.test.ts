import { describe, expect, it } from 'vitest';
import { availabilityKindOf, SCHEDULE_ENTRY_OPTIONS } from './schedule-entry-kind';

describe('schedule entry kind input contract', () => {
  it('keeps exactly the four add-button choices in the required order', () => {
    expect(SCHEDULE_ENTRY_OPTIONS).toEqual([
      { value: 'session', label: '수업' },
      { value: 'available', label: '가능' },
      { value: 'unavailable', label: '불가' },
      { value: 'online_only', label: '온라인만 가능' },
    ]);
  });

  it.each(['available', 'unavailable', 'online_only'] as const)('maps %s without lossy aliases', (value) => {
    expect(availabilityKindOf(value)).toBe(value);
  });
});
