'use client';

import { Field } from '@/components/ui';
import { WEEKDAYS_KO } from '@/lib/domain/schedule';
import { ScheduleDateField } from './ScheduleDateField';

export type ScheduleRepeat = 'none' | 'weekly' | 'custom';

type ScheduleRepeatFieldsProps = {
  repeat: ScheduleRepeat;
  onRepeatChange: (value: ScheduleRepeat) => void;
  customWeekdays: number[];
  onToggleWeekday: (weekday: number) => void;
  untilDate: string;
  onUntilDateChange: (value: string) => void;
  startDate: string;
  occurrencesCount: number;
  noneLabel: string;
};

/** 네 schedule kind가 같은 반복 규칙과 종료일 입력을 사용한다. */
export function ScheduleRepeatFields({
  repeat,
  onRepeatChange,
  customWeekdays,
  onToggleWeekday,
  untilDate,
  onUntilDateChange,
  startDate,
  occurrencesCount,
  noneLabel,
}: ScheduleRepeatFieldsProps) {
  return (
    <>
      <Field label="반복">
        <div className="flex rounded-md overflow-hidden border">
          {([['none', noneLabel], ['weekly', '매주'], ['custom', '커스텀']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onRepeatChange(value)}
              className={`btn btn-sm flex-1 rounded-none border-0 ${repeat === value ? 'badge-accent' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>
      {repeat === 'custom' && (
        <Field label="요일">
          <div className="flex gap-1">
            {WEEKDAYS_KO.map((label, weekday) => (
              <button
                key={weekday}
                type="button"
                onClick={() => onToggleWeekday(weekday)}
                className={`w-8 h-8 rounded text-caption border ${customWeekdays.includes(weekday) ? 'badge-accent' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
      )}
      {repeat !== 'none' && (
        <ScheduleDateField
          label={`종료일 (${occurrencesCount}회)`}
          value={untilDate}
          min={startDate}
          onChange={onUntilDateChange}
        />
      )}
    </>
  );
}
