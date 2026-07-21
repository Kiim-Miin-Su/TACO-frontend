'use client';
import { useState } from 'react';
import Link from 'next/link';
import { SectionCard, toneBg, toneFg } from '@/components/ui';
// 서버 상태(상담 폼·회차)는 TanStack Query 훅에서 구독한다(zustand store 대체).
import { useCounselForms, useCounselRounds } from '@/lib/queries';
import { statusLabel, statusTone } from './labels';
import { counselReservationsOnDate } from '@/lib/domain/counsel';
import { useCounselStudentLookup } from './useCounselStudentLookup';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');

export function CounselCalendar() {
  const { data: forms = [] } = useCounselForms();
  const { data: rounds = [] } = useCounselRounds();
  const { studentById } = useCounselStudentLookup();
  // [수정 2026-07-07] 하드코딩 2026-05 → 오늘 기준 동적 월(시드 상대 날짜와 정합).
  const [ym, setYm] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });

  const startWeekday = new Date(ym.y, ym.m, 1).getDay();
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const monthStr = `${ym.y}-${pad(ym.m + 1)}`;
  const nameOf = (formId: number) => {
    const form = forms.find((row) => row.id === formId);
    return form ? studentById.get(form.studentId)?.name ?? `학생 #${form.studentId}` : '상담';
  };

  const move = (delta: number) => {
    const dt = new Date(ym.y, ym.m + delta, 1);
    setYm({ y: dt.getFullYear(), m: dt.getMonth() });
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <SectionCard
      title={`상담 캘린더 · ${ym.y}년 ${ym.m + 1}월`}
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
        {cells.map((day, idx) => {
          const dateStr = day ? `${monthStr}-${pad(day)}` : '';
          const history = day ? rounds.filter((r) => r.completedAt === dateStr) : [];
          const reservations = day ? counselReservationsOnDate(forms, dateStr) : [];
          return (
            <div key={idx} className="min-h-[92px] border-b border-r p-1.5 border-line-muted">
              {day && <div className="text-caption text-fg-subtle mb-1 px-1">{day}</div>}
              <div className="space-y-1">
                {reservations.map((f) => {
                  const tone = statusTone[f.status];
                  return (
                    <Link key={`r${f.id}`} href={`/counsel/${f.id}`}
                      className="block rounded px-1.5 py-1 text-micro font-medium truncate"
                      style={{ backgroundColor: toneBg[tone], color: toneFg[tone] }}
                      title={`상담 예약 · ${statusLabel[f.status]}`}>
                      📅 {studentById.get(f.studentId)?.name ?? `학생 #${f.studentId}`} 예약 ({statusLabel[f.status]})
                    </Link>
                  );
                })}
                {history.map((r) => {
                  const form = forms.find((f) => f.id === r.counselFormId);
                  const tone = form ? statusTone[form.status] : 'neutral';
                  return (
                    <Link key={`h${r.id}`} href={`/counsel/${r.counselFormId}`}
                      className="block rounded px-1.5 py-1 text-micro font-medium truncate"
                      style={{ backgroundColor: toneBg[tone], color: toneFg[tone] }}
                      title={`상담 내역 · ${form ? statusLabel[form.status] : ''}`}>
                      {nameOf(r.counselFormId)} {r.roundNo + 1}차
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
