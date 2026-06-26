'use client';
import { useState } from 'react';
import { Badge, SectionCard, type Tone } from '@/components/ui';
import { useTacoStore } from '@/lib/store';
import { computeInstructorPay, instructorPaySessionRows } from '@/lib/payroll';
import { won } from '@/lib/format';
import type { PayoutStatus } from '@/types';

const statusLabel: Record<PayoutStatus, string> = { pending: '승인대기', confirmed: '승인됨', paid: '지급완료' };
const statusTone: Record<PayoutStatus, Tone> = { pending: 'attention', confirmed: 'accent', paid: 'success' };
const hours = (min?: number) => `${((min ?? 0) / 60).toFixed(1)}h`;

export function PayoutsView() {
  const store = useTacoStore();
  const instructorName = (id: number) => store.instructors.find((i) => i.id === id)?.name ?? '—';

  const [instructorId, setInstructorId] = useState('');
  const [start, setStart] = useState('2026-06-01');
  const [end, setEnd] = useState('2026-06-30');

  const preview = instructorId
    ? computeInstructorPay(store.classSessions, store.courses, Number(instructorId), start, end)
    : null;
  const breakdown = instructorId
    ? instructorPaySessionRows(store.classSessions, store.courses, Number(instructorId), start, end)
    : [];
  const courseName = (id: number) => store.courses.find((c) => c.id === id)?.name ?? '—';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!instructorId) return;
    store.addInstructorPayout({ instructorId: Number(instructorId), periodStart: start, periodEnd: end });
  };

  return (
    <div className="p-6 max-w-[1000px] mx-auto space-y-6">
      <div>
        <h1 className="text-[20px] font-semibold">강사 페이</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">시수 × 코스 시급으로 산정 · 요청 후 대표 승인 → 지급</p>
      </div>

      <SectionCard title="정산 요청 생성">
        <form onSubmit={submit} className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <Field label="강사 *">
            <select className="input" value={instructorId} onChange={(e) => setInstructorId(e.target.value)}>
              <option value="">선택</option>
              {store.instructors.map((i) => (<option key={i.id} value={i.id}>{i.name}</option>))}
            </select>
          </Field>
          <Field label="시작일"><input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="종료일"><input type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          <button type="submit" className="btn btn-primary h-8" disabled={!instructorId}>정산 요청</button>
          {preview && (
            <div className="sm:col-span-4 text-[13px] text-fg-muted">
              미리보기 — 수업 <b>{preview.sessionCount}</b>회 · 시수 <b>{hours(preview.totalMinutes)}</b> · 산정액 <b className="text-fg">{won(preview.amount)}</b>
            </div>
          )}
        </form>
      </SectionCard>

      {instructorId && (
        <SectionCard title={`진행 수업 내역 (${breakdown.length}건)`}>
          {breakdown.length === 0 ? (
            <div className="p-4 text-[13px] text-fg-subtle">해당 기간에 진행 완료된 수업이 없습니다.</div>
          ) : (
            <table className="table">
              <thead>
                <tr><th>날짜</th><th>코스</th><th>주제</th><th className="text-right">시수</th><th className="text-right">시급</th><th className="text-right">페이</th></tr>
              </thead>
              <tbody>
                {breakdown.map((r) => (
                  <tr key={r.sessionId}>
                    <td className="mono">{r.date}</td>
                    <td className="font-medium">{courseName(r.courseId)}</td>
                    <td className="text-fg-muted">{r.topic ?? '—'}</td>
                    <td className="text-right mono">{(r.minutes / 60).toFixed(1)}h</td>
                    <td className="text-right mono text-fg-muted">{won(r.rate)}</td>
                    <td className="text-right mono">{won(r.pay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      )}

      <SectionCard title="정산 목록">
        <table className="table">
          <thead>
            <tr>
              <th>강사</th><th>기간</th><th className="text-right">시수</th><th className="text-right">금액</th><th>상태</th><th></th>
            </tr>
          </thead>
          <tbody>
            {store.instructorPayouts.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{instructorName(p.instructorId)}</td>
                <td className="mono text-fg-muted">{p.periodStart} ~ {p.periodEnd}</td>
                <td className="text-right mono">{hours(p.totalMinutes)} · {p.sessionCount ?? 0}회</td>
                <td className="text-right mono">{won(p.amount)}</td>
                <td><Badge tone={statusTone[p.status]}>{statusLabel[p.status]}</Badge></td>
                <td className="text-right">
                  {p.status === 'confirmed' && (
                    <button className="btn btn-sm btn-primary" onClick={() => store.markPayoutPaid(p.id)}>지급</button>
                  )}
                  {p.status === 'pending' && <span className="text-[12px] text-fg-subtle">관리자 승인 대기</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
      <p className="text-[12px] text-fg-subtle">지급 처리 시 출금 거래 원장과 대시보드 출금에 반영됩니다. (승인은 관리자 &gt; 승인 센터)</p>
    </div>
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
