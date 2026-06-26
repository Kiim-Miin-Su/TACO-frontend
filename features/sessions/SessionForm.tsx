'use client';
import { useState } from 'react';
import { useTacoStore } from '@/lib/store';

const todayStr = () => new Date().toISOString().slice(0, 10);

export function SessionForm() {
  const courses = useTacoStore((s) => s.courses);
  const instructors = useTacoStore((s) => s.instructors);
  const addClassSession = useTacoStore((s) => s.addClassSession);

  const [courseId, setCourseId] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [sessionDate, setSessionDate] = useState(todayStr());
  const [duration, setDuration] = useState('90');
  const [topic, setTopic] = useState('');

  // 코스 선택 시 담당 강사 자동 채움(변경 가능)
  const pickCourse = (id: string) => {
    setCourseId(id);
    const c = courses.find((x) => x.id === Number(id));
    if (c) setInstructorId(String(c.instructorId));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseId || !instructorId) return;
    addClassSession({
      courseId: Number(courseId),
      instructorId: Number(instructorId),
      sessionDate,
      durationMinutes: Number(duration) || 90,
      topic: topic.trim() || undefined,
    });
    setCourseId(''); setInstructorId(''); setTopic(''); setDuration('90'); setSessionDate(todayStr());
  };

  return (
    <form onSubmit={submit} className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
      <Field label="코스 *">
        <select className="input" value={courseId} onChange={(e) => pickCourse(e.target.value)}>
          <option value="">선택</option>
          {courses.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
      </Field>
      <Field label="강사 *">
        <select className="input" value={instructorId} onChange={(e) => setInstructorId(e.target.value)}>
          <option value="">선택</option>
          {instructors.map((i) => (<option key={i.id} value={i.id}>{i.name}</option>))}
        </select>
      </Field>
      <Field label="날짜 *"><input type="date" className="input" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} /></Field>
      <Field label="시간(분)"><input className="input" type="number" min={10} step={10} value={duration} onChange={(e) => setDuration(e.target.value)} /></Field>
      <Field label="주제"><input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Reading: Inference" /></Field>
      <button type="submit" className="btn btn-primary h-8">수업 개설</button>
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
