'use client';
// 데이터 소스: TanStack Query 훅(usePayments/useStudents)에서 조회.
import Link from 'next/link';
import { Badge, SectionCard, MonthCalendar, PageHeader, EmptyState, TableWrap } from '@/components/ui';
import { usePayments, useStudents } from '@/lib/queries';
import { usePersistedState } from '@/lib/usePersistedState';
import { enumPreferenceCodec, preferenceKeys } from '@/lib/storage/preferences';
import { useTacoStore } from '@/lib/store';
import { canAccessFinance } from '@/lib/roles';
import { won } from '@/lib/format';
import { statusLabel, statusTone, methodLabel } from './labels';

export function PaymentsView() {
  const finance = canAccessFinance(useTacoStore((s) => s.currentRole));
  const { data: payments = [] } = usePayments();
  const { data: students = [] } = useStudents();
  // [C-2 2026-07-06] 목록/달력 보기 토글 typed preference 복원(새로고침에도 유지).
  const [view, setView] = usePersistedState<'list' | 'calendar'>(
    preferenceKeys.paymentsView,
    'list',
    enumPreferenceCodec(['list', 'calendar'] as const),
  );

  const nameOf = (id: number) => students.find((s) => s.id === id)?.name ?? '—';
  // 캘린더 표시 기준: 수납 완료=수납일, 미수=등록일(청구 생성일).
  const dateOf = (p: (typeof payments)[number]) => p.paidAt ?? p.createdAt ?? p.dueAt;

  const totalPaid = payments.filter((p) => p.status === 'paid').reduce((a, p) => a + p.amount, 0);
  const totalDue = payments.filter((p) => p.status === 'pending').reduce((a, p) => a + p.amount, 0);

  if (!finance) {
    return (
      <div className="p-6 max-w-page mx-auto">
        <PageHeader title="결제 · 수납" />
        <EmptyState message="결제·수납 정보는 대표 권한에서만 조회할 수 있습니다." />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-page mx-auto space-y-6">
      <PageHeader
        title="결제 · 수납"
        sub={`완납 ${won(totalPaid)} · 미수 ${won(totalDue)}`}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-md overflow-hidden border">
              <button className={`btn btn-sm rounded-none border-0 ${view === 'list' ? 'badge-accent' : ''}`} onClick={() => setView('list')}>리스트</button>
              <button className={`btn btn-sm rounded-none border-0 ${view === 'calendar' ? 'badge-accent' : ''}`} onClick={() => setView('calendar')}>캘린더</button>
            </div>
            <Link href="/payments/new" className="btn btn-primary btn-sm">신규 청구</Link>
          </div>
        }
      />

      {view === 'list' ? (
        <SectionCard title={`결제 목록 (${payments.length})`}>
          {payments.length === 0 ? (
            <EmptyState message="등록된 결제가 없습니다. “신규 청구”로 등록하세요." />
          ) : (
          <TableWrap>
          <table className="table">
            <thead>
              <tr>
                <th>학생</th>
                <th className="text-right">금액</th>
                <th>수단</th>
                <th>상태</th>
                <th className="text-right">등록일</th>
                <th className="text-right">수납일</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{nameOf(p.studentId)}</td>
                  <td className="text-right mono">{won(p.amount)}</td>
                  <td className="text-fg-muted">{p.paymentMethod ? methodLabel[p.paymentMethod] : '—'}</td>
                  <td><Badge tone={statusTone[p.status]}>{statusLabel[p.status]}</Badge></td>
                  <td className="text-right mono text-fg-muted">{p.createdAt ?? '—'}</td>
                  <td className="text-right mono text-fg-muted">{p.paidAt ?? '—'}</td>
                  <td className="text-right"><Link href={`/payments/${p.id}`} className="btn btn-sm">상세</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableWrap>
          )}
        </SectionCard>
      ) : (
        <MonthCalendar
          titlePrefix="결제 · "
          renderDay={(dateStr) =>
            payments
              .filter((p) => dateOf(p) === dateStr)
              .map((p) => (
                <Link
                  key={p.id}
                  href={`/payments/${p.id}`}
                  className="block rounded px-1.5 py-1 text-micro font-medium truncate"
                  style={{
                    backgroundColor: p.status === 'paid' ? 'var(--color-success-subtle)' : 'var(--color-attention-subtle)',
                    color: p.status === 'paid' ? 'var(--color-success)' : 'var(--color-attention)',
                  }}
                >
                  {nameOf(p.studentId)} {won(p.amount)}
                </Link>
              ))
          }
        />
      )}
    </div>
  );
}
