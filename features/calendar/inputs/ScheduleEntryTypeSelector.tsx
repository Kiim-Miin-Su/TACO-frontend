'use client';

import { SCHEDULE_ENTRY_OPTIONS, type ScheduleEntryType } from '@/lib/domain/schedule-entry-kind';

type ScheduleEntryTypeSelectorProps = {
  value: ScheduleEntryType;
  onChange: (value: ScheduleEntryType) => void;
};

export function ScheduleEntryTypeSelector({ value, onChange }: ScheduleEntryTypeSelectorProps) {
  return (
    <div className="flex rounded-md overflow-hidden border" role="group" aria-label="스케줄 유형">
      {SCHEDULE_ENTRY_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`btn btn-sm flex-1 rounded-none border-0 ${value === option.value ? 'badge-accent' : ''}`}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
