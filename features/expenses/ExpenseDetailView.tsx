'use client';
// [B7 E3 2026-07-16] 주 엔티티 단건화(useExpense(id) + DetailStates) — full-list find 제거(EP16)
import { useState } from 'react';
import Link from 'next/link';
import { Badge, DetailStates, SectionCard } from '@/components/ui';
import { useExpense, useApproveExpense, useRejectExpense } from '@/lib/queries';
import { useAccountAccess } from '@/lib/useAccountAccess';
import { won } from '@/lib/format';
import { ReasonModal } from '@/components/ReasonModal';
import { categoryLabel, categoryTone, approvalLabel, approvalTone } from './labels';

export function ExpenseDetailView({ expenseId }: { expenseId: number }) {
  const { can } = useAccountAccess();
  const finance = can('finance.access');
  const admin = can('admin.area');
  const expenseQuery = useExpense(expenseId);
  const approveExpense = useApproveExpense();
  const rejectExpense = useRejectExpense();
  const [modal, setModal] = useState<'reject' | 'viewReason' | null>(null);

  // useExpense는 finance.access 게이트(enabled) — 비-finance는 isPending이 계속 true라
  // DetailStates보다 **앞에서** 차단(문구는 목록 뷰 ExpensesView의 권한 안내와 동일).
  if (!finance) {
    return (
      <div className="p-6 max-w-[720px] mx-auto">
        <Link href="/expenses" className="text-caption text-fg-muted hover:underline">← 지출 목록</Link>
        <div className="mt-3 text-fg-muted">지출 정보는 대표 권한에서만 조회할 수 있습니다.</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[720px] mx-auto space-y-5">
      <DetailStates query={expenseQuery} notFoundMessage={`지출을 찾을 수 없습니다. (id: ${expenseId})`} backHref="/expenses">
        {(expense) => {
          const rows: [string, string][] = [
            ['항목', expense.title],
            ['금액', won(expense.amount)],
            ['거래처', expense.vendor ?? '—'],
            ['지출일', expense.spentAt],
            ['메모', expense.memo ?? '—'],
          ];

          return (
            <>
              <div>
                <Link href="/expenses" className="text-caption text-fg-muted hover:underline">← 지출 목록</Link>
                <div className="flex items-center gap-2 mt-1">
                  <h1 className="text-title font-bold">{expense.title}</h1>
                  <Badge tone={categoryTone[expense.category]}>{categoryLabel[expense.category]}</Badge>
                  <Badge tone={approvalTone[expense.status]}>{approvalLabel[expense.status]}</Badge>
                </div>
              </div>

              {/* 관리자: 그 자리에서 승인/반려 (관리자 탭은 몰아보기용) */}
              {admin && expense.status === 'requested' && (
                <div className="flex gap-2">
                  <button className="btn btn-primary" onClick={() => approveExpense.mutate(expense.id)}>승인</button>
                  <button className="btn btn-danger" onClick={() => setModal('reject')}>반려</button>
                </div>
              )}
              {expense.status === 'rejected' && (
                <button className="text-body text-danger hover:underline" onClick={() => setModal('viewReason')}>반려 사유 보기</button>
              )}

              <SectionCard title="지출 상세">
                <div className="divide-y border-line-muted">
                  {rows.map(([k, v]) => (
                    <div key={k} className="flex px-4 py-3 text-body">
                      <span className="w-32 text-fg-muted">{k}</span>
                      <span className={k === '금액' ? 'mono font-medium' : ''}>{v}</span>
                    </div>
                  ))}
                </div>
                {expense.receiptUrl && (
                  <div className="p-4 border-t">
                    <div className="text-caption text-fg-muted mb-2">영수증</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={expense.receiptUrl} alt="영수증" className="max-h-72 rounded border" />
                  </div>
                )}
              </SectionCard>

              {modal === 'reject' && (
                <ReasonModal mode="input" title="지출 반려" onClose={() => setModal(null)}
                  onSubmit={(reason) => { rejectExpense.mutate({ id: expense.id, reason }); setModal(null); }} />
              )}
              {modal === 'viewReason' && (
                <ReasonModal mode="view" title="지출 반려 사유" initial={expense.rejectedReason ?? ''} onClose={() => setModal(null)} />
              )}
            </>
          );
        }}
      </DetailStates>
    </div>
  );
}
