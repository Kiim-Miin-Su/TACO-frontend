'use client';

import { Field } from '@/components/ui';
import { fromMin, toMin } from '@/lib/domain/schedule';
import { TimeSelect } from './TimeSelect';

const DURATION_PRESETS = [30, 60, 90, 120, 150, 180] as const;
const durationLabel = (minutes: number) => (
  minutes < 60 ? `${minutes}분` : `${Math.floor(minutes / 60)}시간${minutes % 60 ? '30분' : ''}`
);

type ScheduleTimeRangeFieldsProps = {
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  endHint?: string;
  compact?: boolean;
  showPresets?: boolean;
};

/** 수업·가능·불가·온라인만 가능 생성/편집이 공유하는 시간 범위 입력. */
export function ScheduleTimeRangeFields({
  start,
  end,
  onStartChange,
  onEndChange,
  endHint,
  compact = false,
  showPresets = true,
}: ScheduleTimeRangeFieldsProps) {
  const duration = (toMin(end) - toMin(start) + 1440) % 1440;
  const selectClassName = compact ? 'h-8 text-caption' : undefined;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <Field label="시작"><TimeSelect value={start} onChange={onStartChange} className={selectClassName} /></Field>
        <Field label={`종료${endHint ? ` (${endHint})` : ''}`}>
          <TimeSelect value={end} onChange={onEndChange} className={selectClassName} />
        </Field>
      </div>
      {showPresets && (
        <div className="flex flex-wrap gap-1">
          <span className="text-micro text-fg-subtle self-center mr-0.5">빠른 선택</span>
          {DURATION_PRESETS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              onClick={() => onEndChange(fromMin((toMin(start) + minutes) % 1440))}
              className={`btn btn-sm ${duration === minutes ? 'badge-accent' : ''}`}
            >
              {durationLabel(minutes)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
