'use client';
// 데이터 소스: TanStack Query 훅(usePayments/useStudents)에서 조회.
// [B6 C3 2026-07-16] 행 전체 클릭 = 결제 상세(ClickableTableRow href) — 셀 '상세' Link는 유지(중첩 제외).
import Link from 'next/link';
import { Badge, ClickableTableRow, SectionCard, MonthCalendar, PageHeader, EmptyState, LoadingState, TableWrap } from '@/components/ui';
import { usePayments, useStudents, useRevenueReport } from '@/lib/queries';
import { usePersistedState } from '@/lib/usePersistedState';
import { enumPreferenceCodec, preferenceKeys } from '@/lib/storage/preferences';
import { useAccountAccess } from '@/lib/useAccountAccess';
import { dateOnly, won } from '@/lib/format';
import { statusLabel, statusTone, methodLabel } from './labels';

export function PaymentsView() {
  const finance = useAccountAccess().can('finance.access');
  const { data: payments = [], isPending: loading } = usePayments(); // [E0.6 H2] 로드 중 빈 상태 깜빡임 방지
  const { data: students = [] } = useStudents();
  // [C-2 2026-07-06] 목록/달력 보기 토글 typed preference 복원(새로고침에도 유지).
  const [view, setView] = usePersistedState<'list' | 'calendar'>(
    preferenceKeys.paymentsView,
    'list',
    enumPreferenceCodec(['list', 'calendar'] as const),
  );

  const revenue = useRevenueReport().data; // [TBO-65 P1] 서버 파생 합계(전기간)
  const nameOf = (id: number) => students.find((s) => s.id === id)?.name ?? '—';
  // 캘린더 표시 기준: 수납 완료=수납일, 미수=등록일(청구 생성일).
  // [E0.6 M] ISO 타임스탬프가 오면 날짜 비교가 영원히 불일치 — dateOnly로 정규화 후 셀 매칭.
  const dateOf = (p: (typeof payments)[number]) => dateOnly(p.paidAt ?? p.createdAt ?? p.dueAt);

  // [TBO-65 P1 2026-07-24] 헤더 요약 = 서버 파생(revenueReport — 전 화면과 같은 정의) 소비.
  //  종전 클라 재합산은 ① 미수에 overdue 전량 누락 ② 부분 수납(paidAmount) 미반영으로
  //  경영지표·학생 상세와 다른 수치를 보여줬다(감사 FE-2). 실현 수납/미수 잔액 정의 단일화.

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
        sub={revenue ? `실현 수납 ${won(revenue.realizedTotal)} · 미수 ${won(revenue.unpaidTotal)} (${revenue.unpaidCount}건)` : '수납 합계 불러오는 중…'}
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
          {loading ? (
            <LoadingState />
          ) : payments.length === 0 ? (
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
                <ClickableTableRow key={p.id} href={`/payments/${p.id}`} label={`${nameOf(p.studentId)} 결제 상세`}>
                  <td className="font-medium">{nameOf(p.studentId)}</td>
                  <td className="text-right mono">{won(p.amount)}</td>
                  <td className="text-fg-muted">{p.paymentMethod ? methodLabel[p.paymentMethod] : '—'}</td>
                  <td><Badge tone={statusTone[p.status]}>{statusLabel[p.status]}</Badge></td>
                  {/* [E0.6 M] 날짜 표기 통일 — raw ISO(시각·타임존 포함) 노출 대신 공용 dateOnly */}
                  <td className="text-right mono text-fg-muted">{dateOnly(p.createdAt)}</td>
                  <td className="text-right mono text-fg-muted">{dateOnly(p.paidAt)}</td>
                  <td className="text-right"><Link href={`/payments/${p.id}`} className="btn btn-sm">상세</Link></td>
                </ClickableTableRow>
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
