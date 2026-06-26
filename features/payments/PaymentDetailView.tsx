'use client';
import Link from 'next/link';
import { Badge, SectionCard } from '@/components/ui';
import { useTacoStore } from '@/lib/store';
import { won } from '@/lib/format';
import { statusLabel, statusTone, methodLabel } from './labels';

export function PaymentDetailView({ paymentId }: { paymentId: number }) {
  const store = useTacoStore();
  const payment = store.payments.find((p) => p.id === paymentId);

  if (!payment) {
    return (
      <div className="p-6 max-w-[720px] mx-auto">
        <Link href="/payments" className="text-[12px] text-fg-muted hover:underline">← 결제 목록</Link>
        <div className="mt-3 text-fg-muted">결제를 찾을 수 없습니다. (id: {paymentId})</div>
      </div>
    );
  }

  const student = store.students.find((s) => s.id === payment.studentId);
  const enrollment = payment.enrollmentId ? store.enrollments.find((e) => e.id === payment.enrollmentId) : undefined;
  const course = enrollment ? store.courses.find((c) => c.id === enrollment.courseId) : undefined;

  const rows: [string, string][] = [
    ['학생', student?.name ?? '—'],
    ['코스', course?.name ?? '— (직접 청구)'],
    ['청구 금액', won(payment.amount)],
    ['수납액', won(payment.paidAmount ?? 0)],
    ['결제 수단', payment.paymentMethod ? methodLabel[payment.paymentMethod] : '—'],
    ['납부 기한', payment.dueAt ?? '—'],
    ['수납일', payment.paidAt ?? '—'],
  ];

  return (
    <div className="p-6 max-w-[720px] mx-auto space-y-5">
      <div>
        <Link href="/payments" className="text-[12px] text-fg-muted hover:underline">← 결제 목록</Link>
        <div className="flex items-center gap-2 mt-1">
          <h1 className="text-[20px] font-semibold">{student?.name ?? '결제'} · {won(payment.amount)}</h1>
          <Badge tone={statusTone[payment.status]}>{statusLabel[payment.status]}</Badge>
        </div>
      </div>

      <SectionCard
        title="결제 상세"
        action={
          payment.status === 'pending' ? (
            <button className="btn btn-primary btn-sm" onClick={() => store.markPaymentPaid(payment.id)}>
              수납 처리
            </button>
          ) : undefined
        }
      >
        <div className="divide-y" style={{ borderColor: 'var(--color-line-muted)' }}>
          {rows.map(([k, v]) => (
            <div key={k} className="flex px-4 py-3 text-[13px]">
              <span className="w-32 text-fg-muted">{k}</span>
              <span className={k.includes('금액') || k.includes('수납액') ? 'mono font-medium' : ''}>{v}</span>
            </div>
          ))}
        </div>
      </SectionCard>
      <p className="text-[12px] text-fg-subtle">수납 처리하면 입·출금 원장과 대시보드 입금/미수금에 반영됩니다.</p>
    </div>
  );
}
