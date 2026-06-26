'use client';
import { useState } from 'react';
import { Badge, SectionCard, MonthCalendar } from '@/components/ui';
import { useTacoStore } from '@/lib/store';
import { won } from '@/lib/format';
import type { EventType } from '@/types';
import { eventLabel, eventTone, EVENT_TYPES } from './labels';

const eventStyle: Record<EventType, { bg: string; fg: string }> = {
  notice: { bg: 'var(--color-accent-subtle)', fg: 'var(--color-accent)' },
  exam: { bg: 'var(--color-done-subtle)', fg: 'var(--color-done)' },
  holiday: { bg: 'var(--color-danger-subtle)', fg: 'var(--color-danger)' },
  closure: { bg: 'var(--color-attention-subtle)', fg: 'var(--color-attention)' },
  event: { bg: 'var(--color-success-subtle)', fg: 'var(--color-success)' },
};

export function AdminView() {
  const subjects = useTacoStore((s) => s.subjects);
  const courses = useTacoStore((s) => s.courses);
  const instructors = useTacoStore((s) => s.instructors);
  const events = useTacoStore((s) => s.academyEvents);

  const subjectName = (id: number) => subjects.find((x) => x.id === id)?.name ?? '—';
  const instructorName = (id: number) => instructors.find((x) => x.id === id)?.name ?? '—';

  return (
    <div className="p-6 max-w-[1100px] mx-auto space-y-6">
      <div>
        <h1 className="text-[20px] font-semibold">관리자</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">코스·과목 관리 · 학원 이벤트 발행 · 통합 캘린더</p>
      </div>

      <AcademyCalendar />

      <div className="grid lg:grid-cols-2 gap-6">
        <SectionCard title="코스 추가"><CourseForm /></SectionCard>
        <SectionCard title="과목 추가"><SubjectForm /></SectionCard>
      </div>

      <SectionCard title="코스 목록">
        <table className="table">
          <thead><tr><th>코스</th><th>과목</th><th>강사</th><th className="text-right">정가</th></tr></thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">{c.name}</td>
                <td className="text-fg-muted">{subjectName(c.subjectId)}</td>
                <td className="text-fg-muted">{instructorName(c.instructorId)}</td>
                <td className="text-right mono">{won(c.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title="학원 이벤트 발행"><EventForm /></SectionCard>

      <SectionCard title="이벤트 목록">
        <table className="table">
          <thead><tr><th>제목</th><th>유형</th><th>기간</th></tr></thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className="font-medium">{e.title}</td>
                <td><Badge tone={eventTone[e.type]}>{eventLabel[e.type]}</Badge></td>
                <td className="mono text-fg-muted">{e.startDate}{e.endDate !== e.startDate ? ` ~ ${e.endDate}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}

function AcademyCalendar() {
  const classSessions = useTacoStore((s) => s.classSessions);
  const courses = useTacoStore((s) => s.courses);
  const events = useTacoStore((s) => s.academyEvents);
  const courseName = (id: number) => courses.find((c) => c.id === id)?.name ?? '수업';

  return (
    <MonthCalendar
      titlePrefix="학원 일정 · "
      renderDay={(dateStr) => (
        <>
          {events
            .filter((e) => dateStr >= e.startDate && dateStr <= e.endDate)
            .map((e) => (
              <div key={`e${e.id}`} className="rounded px-1.5 py-1 text-[11px] font-medium truncate"
                style={{ backgroundColor: eventStyle[e.type].bg, color: eventStyle[e.type].fg }} title={e.title}>
                {eventLabel[e.type]} · {e.title}
              </div>
            ))}
          {classSessions
            .filter((s) => s.sessionDate === dateStr)
            .map((s) => (
              <div key={`s${s.id}`} className="rounded px-1.5 py-1 text-[11px] truncate"
                style={{ backgroundColor: 'var(--color-canvas-subtle)', color: 'var(--color-fg-muted)' }} title={courseName(s.courseId)}>
                {courseName(s.courseId)}
              </div>
            ))}
        </>
      )}
    />
  );
}

function CourseForm() {
  const subjects = useTacoStore((s) => s.subjects);
  const instructors = useTacoStore((s) => s.instructors);
  const addCourse = useTacoStore((s) => s.addCourse);
  const [name, setName] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [price, setPrice] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !subjectId || !instructorId) return;
    addCourse({ name: name.trim(), subjectId: Number(subjectId), instructorId: Number(instructorId), price: Number(price) || 0 });
    setName(''); setSubjectId(''); setInstructorId(''); setPrice('');
  };

  return (
    <form onSubmit={submit} className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="코스명 *"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="SAT Reading 정규" /></Field>
      <Field label="정가(원)"><input className="input" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="480000" /></Field>
      <Field label="과목 *">
        <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          <option value="">선택</option>
          {subjects.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
        </select>
      </Field>
      <Field label="담당 강사 *">
        <select className="input" value={instructorId} onChange={(e) => setInstructorId(e.target.value)}>
          <option value="">선택</option>
          {instructors.map((i) => (<option key={i.id} value={i.id}>{i.name}</option>))}
        </select>
      </Field>
      <div className="sm:col-span-2 flex justify-end"><button type="submit" className="btn btn-primary">코스 추가</button></div>
    </form>
  );
}

function SubjectForm() {
  const addSubject = useTacoStore((s) => s.addSubject);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;
    addSubject({ code: code.trim(), name: name.trim() });
    setCode(''); setName('');
  };
  return (
    <form onSubmit={submit} className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="코드 *"><input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="science" /></Field>
      <Field label="과목명 *"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="과학" /></Field>
      <div className="sm:col-span-2 flex justify-end"><button type="submit" className="btn btn-primary">과목 추가</button></div>
    </form>
  );
}

function EventForm() {
  const addAcademyEvent = useTacoStore((s) => s.addAcademyEvent);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<EventType>('notice');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [memo, setMemo] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startDate) return;
    addAcademyEvent({
      title: title.trim(),
      type,
      startDate,
      endDate: endDate || startDate,
      memo: memo.trim() || undefined,
    });
    setTitle(''); setType('notice'); setStartDate(''); setEndDate(''); setMemo('');
  };

  return (
    <form onSubmit={submit} className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <Field label="제목 *"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="여름 특강 등록 시작" /></Field>
      <Field label="유형">
        <select className="input" value={type} onChange={(e) => setType(e.target.value as EventType)}>
          {EVENT_TYPES.map((t) => (<option key={t} value={t}>{eventLabel[t]}</option>))}
        </select>
      </Field>
      <Field label="메모"><input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="비고" /></Field>
      <Field label="시작일 *"><input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
      <Field label="종료일"><input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
      <div className="flex items-end justify-end"><button type="submit" className="btn btn-primary">이벤트 발행</button></div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-fg-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
