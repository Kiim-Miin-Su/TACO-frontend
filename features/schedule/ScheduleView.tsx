'use client';
import { useState } from 'react';
import { MonthCalendar } from '@/components/ui';
import { useTacoStore } from '@/lib/store';
import { isStudentOrParent } from '@/lib/roles';
import { eventLabel, eventStyle } from '@/features/admin/labels';

type ClassScope = 'mine' | 'all';
type EventScope = 'important' | 'all' | 'none';

export function ScheduleView() {
  const store = useTacoStore();
  const myView = isStudentOrParent(store.currentRole);

  // 기본값: 학생/학부모 → 내 수업 + 중요 이벤트
  const [classScope, setClassScope] = useState<ClassScope>(myView ? 'mine' : 'all');
  const [eventScope, setEventScope] = useState<EventScope>(myView ? 'important' : 'all');

  const myCourseIds = new Set(
    store.enrollments.filter((e) => e.studentId === store.currentStudentId).map((e) => e.courseId),
  );
  const courseName = (id: number) => store.courses.find((c) => c.id === id)?.name ?? '수업';

  const sessions = store.classSessions.filter((s) => classScope === 'all' || myCourseIds.has(s.courseId));
  const events = store.academyEvents.filter((e) =>
    eventScope === 'none' ? false : eventScope === 'important' ? e.priority === 'high' : true,
  );

  return (
    <div className="p-6 max-w-[1100px] mx-auto space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold">학원 캘린더</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">수업과 학원 일정을 한눈에. 필터로 골라 보세요.</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <Filter label="수업" value={classScope} onChange={(v) => setClassScope(v as ClassScope)}
          options={[['mine', '내 수업'], ['all', '전체 수업']]} />
        <Filter label="이벤트" value={eventScope} onChange={(v) => setEventScope(v as EventScope)}
          options={[['important', '중요만'], ['all', '전체'], ['none', '숨김']]} />
      </div>

      <MonthCalendar
        renderDay={(dateStr) => (
          <>
            {events
              .filter((e) => dateStr >= e.startDate && dateStr <= e.endDate)
              .map((e) => (
                <div key={`e${e.id}`} className="rounded px-1.5 py-1 text-[11px] font-medium truncate"
                  style={{ backgroundColor: eventStyle[e.type].bg, color: eventStyle[e.type].fg }} title={e.title}>
                  {e.priority === 'high' ? '★ ' : ''}{eventLabel[e.type]} · {e.title}
                </div>
              ))}
            {sessions
              .filter((s) => s.sessionDate === dateStr)
              .map((s) => (
                <div key={`s${s.id}`} className="rounded px-1.5 py-1 text-[11px] truncate"
                  style={{ backgroundColor: 'var(--color-canvas-subtle)', color: 'var(--color-fg-muted)' }}
                  title={`${courseName(s.courseId)}${s.topic ? ' · ' + s.topic : ''}`}>
                  {courseName(s.courseId)}
                </div>
              ))}
          </>
        )}
      />

      <div className="flex flex-wrap gap-3 text-[12px] text-fg-muted">
        <Legend bg="var(--color-canvas-subtle)" fg="var(--color-fg-muted)" label="수업" />
        <Legend bg={eventStyle.notice.bg} fg={eventStyle.notice.fg} label="공지" />
        <Legend bg={eventStyle.exam.bg} fg={eventStyle.exam.fg} label="시험" />
        <Legend bg={eventStyle.holiday.bg} fg={eventStyle.holiday.fg} label="휴원" />
        <span>★ = 중요 이벤트</span>
      </div>
    </div>
  );
}

function Filter({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] font-medium text-fg-muted">{label}</span>
      <div className="flex rounded-md overflow-hidden border" style={{ borderColor: 'var(--color-line)' }}>
        {options.map(([v, l]) => (
          <button key={v} className={`btn btn-sm rounded-none border-0 ${value === v ? 'badge-accent' : ''}`} onClick={() => onChange(v)}>{l}</button>
        ))}
      </div>
    </div>
  );
}

function Legend({ bg, fg, label }: { bg: string; fg: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: bg, border: `1px solid ${fg}` }} />
      {label}
    </span>
  );
}
