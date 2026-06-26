'use client';
import { useMemo, useState } from 'react';
import { Chart, SectionCard } from '@/components/ui';
import { useTacoStore } from '@/lib/store';
import { won } from '@/lib/format';
import type { ChartConfiguration } from 'chart.js';

const PALETTE = ['#0f766e', '#2563eb', '#e08a00', '#8250df', '#0f9d6b', '#cf222e', '#1c7293'];
const wonTick = (v: number | string) => `₩${Number(v).toLocaleString('ko-KR')}`;

export function RevenueCharts() {
  const payments = useTacoStore((s) => s.payments);
  const enrollments = useTacoStore((s) => s.enrollments);
  const courses = useTacoStore((s) => s.courses);
  const subjects = useTacoStore((s) => s.subjects);
  const students = useTacoStore((s) => s.students);

  const [start, setStart] = useState('2026-05-01');
  const [end, setEnd] = useState('2026-06-30');

  const { total, byMonth, byStudent, bySubject, byCourse } = useMemo(() => {
    const paid = payments.filter((p) => p.status === 'paid' && p.paidAt && p.paidAt >= start && p.paidAt <= end);
    const sum = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
    const month = new Map<string, number>();
    const student = new Map<string, number>();
    const subject = new Map<string, number>();
    const course = new Map<string, number>();
    for (const p of paid) {
      sum(month, p.paidAt!.slice(0, 7), p.amount);
      sum(student, students.find((s) => s.id === p.studentId)?.name ?? `#${p.studentId}`, p.amount);
      const enr = p.enrollmentId ? enrollments.find((e) => e.id === p.enrollmentId) : undefined;
      const c = enr ? courses.find((x) => x.id === enr.courseId) : undefined;
      if (c) {
        sum(course, c.name, p.amount);
        sum(subject, subjects.find((s) => s.id === c.subjectId)?.name ?? '기타', p.amount);
      }
    }
    const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
    return {
      total: paid.reduce((a, p) => a + p.amount, 0),
      byMonth: [...month.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      byStudent: sorted(student),
      bySubject: sorted(subject),
      byCourse: sorted(course),
    };
  }, [payments, enrollments, courses, subjects, students, start, end]);

  const periodCfg: ChartConfiguration = {
    type: 'bar',
    data: { labels: byMonth.map((x) => x[0]), datasets: [{ label: '매출', data: byMonth.map((x) => x[1]), backgroundColor: '#0f766e', borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: (v) => wonTick(v as number) } } } },
  };
  const studentCfg: ChartConfiguration = {
    type: 'bar',
    data: { labels: byStudent.map((x) => x[0]), datasets: [{ label: '매출', data: byStudent.map((x) => x[1]), backgroundColor: '#2563eb', borderRadius: 4 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { callback: (v) => wonTick(v as number) } } } },
  };
  const subjectCfg: ChartConfiguration = {
    type: 'doughnut',
    data: { labels: bySubject.map((x) => x[0]), datasets: [{ data: bySubject.map((x) => x[1]), backgroundColor: PALETTE }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } },
  };
  const courseCfg: ChartConfiguration = {
    type: 'bar',
    data: { labels: byCourse.map((x) => x[0]), datasets: [{ label: '매출', data: byCourse.map((x) => x[1]), backgroundColor: '#e08a00', borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: (v) => wonTick(v as number) } } } },
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title={`매출 분석 (실현 매출 ${won(total)})`}
        action={
          <div className="flex items-center gap-1.5">
            <input type="date" className="input h-7 w-36" value={start} onChange={(e) => setStart(e.target.value)} />
            <span className="text-fg-subtle">~</span>
            <input type="date" className="input h-7 w-36" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        }
      >
        <div className="p-4"><Chart config={periodCfg} height={240} /></div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="인당 매출 순위"><div className="p-4"><Chart config={studentCfg} height={240} /></div></SectionCard>
        <SectionCard title="과목별 매출"><div className="p-4"><Chart config={subjectCfg} height={240} /></div></SectionCard>
      </div>
      <SectionCard title="수업(코스)별 매출"><div className="p-4"><Chart config={courseCfg} height={240} /></div></SectionCard>
    </div>
  );
}
