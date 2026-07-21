'use client';

import { pad2 } from '@/lib/domain/schedule';

const MINUTE_STEP = 5;

type TimeSelectProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

/** 24시간 HH:mm 공용 입력. 브라우저 locale의 AM/PM 차이를 제거한다. */
export function TimeSelect({ value, onChange, className }: TimeSelectProps) {
  const [hour, minute] = (value || '00:00').split(':').map(Number);
  const selectedMinute = Math.round((minute || 0) / MINUTE_STEP) * MINUTE_STEP;
  const inputClass = `input ${className ?? ''}`.trim();

  return (
    <div className="flex items-center gap-1">
      <select
        className={`${inputClass} px-1`}
        value={hour}
        onChange={(event) => onChange(`${pad2(Number(event.target.value))}:${pad2(selectedMinute)}`)}
        aria-label="시"
      >
        {Array.from({ length: 24 }, (_, index) => <option key={index} value={index}>{pad2(index)}시</option>)}
      </select>
      <select
        className={`${inputClass} px-1`}
        value={selectedMinute}
        onChange={(event) => onChange(`${pad2(hour)}:${pad2(Number(event.target.value))}`)}
        aria-label="분"
      >
        {Array.from({ length: 60 / MINUTE_STEP }, (_, index) => index * MINUTE_STEP)
          .map((value) => <option key={value} value={value}>{pad2(value)}분</option>)}
      </select>
    </div>
  );
}
