'use client';
import { useState } from 'react';
import { Badge, SectionCard } from '@/components/ui';
import { useTacoStore } from '@/lib/store';
import type { EventType, EventPriority } from '@/types';
import { AdminGuard, AdminHeader, Field } from './AdminShell';
import { eventLabel, eventTone, EVENT_TYPES, priorityLabel, EVENT_PRIORITIES } from './labels';

export function EventsView() {
  const events = useTacoStore((s) => s.academyEvents);
  return (
    <AdminGuard>
      <div className="p-6 max-w-[1100px] mx-auto space-y-6">
        <AdminHeader />
        <SectionCard title="학원 이벤트 발행"><EventForm /></SectionCard>
        <SectionCard title="이벤트 목록">
          <table className="table">
            <thead><tr><th>제목</th><th>유형</th><th>우선순위</th><th>기간</th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="font-medium">{e.title}</td>
                  <td><Badge tone={eventTone[e.type]}>{eventLabel[e.type]}</Badge></td>
                  <td>{e.priority === 'high' ? <Badge tone="danger">★ 중요</Badge> : <span className="text-fg-muted">{priorityLabel[e.priority]}</span>}</td>
                  <td className="mono text-fg-muted">{e.startDate}{e.endDate !== e.startDate ? ` ~ ${e.endDate}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      </div>
    </AdminGuard>
  );
}

function EventForm() {
  const addAcademyEvent = useTacoStore((s) => s.addAcademyEvent);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<EventType>('notice');
  const [priority, setPriority] = useState<EventPriority>('normal');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [memo, setMemo] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startDate) return;
    addAcademyEvent({
      title: title.trim(), type, priority,
      startDate, endDate: endDate || startDate,
      memo: memo.trim() || undefined,
    });
    setTitle(''); setType('notice'); setPriority('normal'); setStartDate(''); setEndDate(''); setMemo('');
  };

  return (
    <form onSubmit={submit} className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <Field label="제목 *"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="여름 특강 등록 시작" /></Field>
      <Field label="유형">
        <select className="input" value={type} onChange={(e) => setType(e.target.value as EventType)}>
          {EVENT_TYPES.map((t) => (<option key={t} value={t}>{eventLabel[t]}</option>))}
        </select>
      </Field>
      <Field label="우선순위 (중요=학생 기본 노출)">
        <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as EventPriority)}>
          {EVENT_PRIORITIES.map((p) => (<option key={p} value={p}>{priorityLabel[p]}</option>))}
        </select>
      </Field>
      <Field label="시작일 *"><input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
      <Field label="종료일"><input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
      <Field label="메모"><input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="비고" /></Field>
      <div className="lg:col-span-3 flex justify-end"><button type="submit" className="btn btn-primary">이벤트 발행</button></div>
    </form>
  );
}
