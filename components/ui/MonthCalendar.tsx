'use client';
import { useState, type ReactNode } from 'react';
import { SectionCard } from './SectionCard';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');
const currentMonth = () => {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth() };
};

// 재사용 월 캘린더. 각 날짜 셀 내용은 renderDay(dateStr)로 주입.
export function MonthCalendar({
  initialYear,
  initialMonth,
  titlePrefix,
  renderDay,
}: {
  initialYear?: number;
  initialMonth?: number;
  titlePrefix?: string;
  renderDay: (dateStr: string, day: number) => ReactNode;
}) {
  const [ym, setYm] = useState(() => {
    const now = currentMonth();
    return { y: initialYear ?? now.y, m: initialMonth ?? now.m };
  });
  const startWeekday = new Date(ym.y, ym.m, 1).getDay();
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const monthStr = `${ym.y}-${pad(ym.m + 1)}`;
  const move = (d: number) => {
    const dt = new Date(ym.y, ym.m + d, 1);
    setYm({ y: dt.getFullYear(), m: dt.getMonth() });
  };
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <SectionCard
      title={`${titlePrefix ?? ''}${ym.y}년 ${ym.m + 1}월`}
      action={
        <div className="flex gap-1.5">
          <button className="btn btn-sm" onClick={() => move(-1)}>← 이전</button>
          <button className="btn btn-sm" onClick={() => move(1)}>다음 →</button>
        </div>
      }
    >
      <div className="grid grid-cols-7 border-b">
        {WEEK.map((w, i) => (
          <div key={w} className={`px-3 py-2 text-caption font-semibold ${i === 0 ? 'text-danger' : i === 6 ? 'text-accent' : 'text-fg-muted'}`}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => (
          <div key={idx} className="min-h-[92px] border-b border-r p-1.5 border-line-muted">
            {day && <div className="text-caption text-fg-subtle mb-1 px-1">{day}</div>}
            <div className="space-y-1">{day ? renderDay(`${monthStr}-${pad(day)}`, day) : null}</div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
