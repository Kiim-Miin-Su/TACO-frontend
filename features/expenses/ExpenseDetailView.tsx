'use client';
// [B7 E3 2026-07-16] 주 엔티티 단건화(useExpense(id) + DetailStates) — full-list find 제거(EP16)
// [TBO-58 P2 2026-07-24] requested 지출 수정·철회 — 종전엔 승인/반려만 있어 오기입 정정 경로가
//  전무했던 실갭(검증①). 서버가 상태 가드(승인 후 400)·CAS 판정 — 여기는 표시·명령만.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { Badge, ConfirmModal, DetailStates, Field, ModalShell, SectionCard } from '@/components/ui';
import { useExpense, useApproveExpense, useRejectExpense, useUpdateExpense, useWithdrawExpense } from '@/lib/queries';
import { useAccountAccess } from '@/lib/useAccountAccess';
import { won } from '@/lib/format';
import { ReasonModal } from '@/components/ReasonModal';
import type { Expense, ExpenseCategory } from '@/types';
import { CATEGORIES, categoryLabel, categoryTone, approvalLabel, approvalTone } from './labels';
import { useSudoAction } from '@/lib/hooks/useSudoAction';
import { apiErrorMessage } from '@/lib/api-error';

export function ExpenseDetailView({ expenseId }: { expenseId: number }) {
  const router = useRouter();
  const { can } = useAccountAccess();
  const finance = can('finance.access');
  const admin = can('admin.area');
  const expenseQuery = useExpense(expenseId);
  const approveExpense = useApproveExpense();
  const rejectExpense = useRejectExpense();
  const withdrawExpense = useWithdrawExpense();
  const sudoAction = useSudoAction();
  const [modal, setModal] = useState<'approve' | 'reject' | 'viewReason' | 'edit' | 'withdraw' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

              {/* 관리자: 그 자리에서 승인/반려 + [TBO-58 P2] 수정·철회(requested만 — 서버 가드와 동일 조건 렌더) */}
              {admin && expense.status === 'requested' && (
                <div className="flex gap-2">
                  <button className="btn btn-primary" disabled={approveExpense.isPending || sudoAction.isPending}
                    onClick={() => { setActionError(null); setModal('approve'); }}>승인</button>
                  <button className="btn btn-danger" onClick={() => setModal('reject')}>반려</button>
                  <button className="btn" onClick={() => setModal('edit')}>수정</button>
                  <button className="btn text-danger" onClick={() => setModal('withdraw')}>철회</button>
                </div>
              )}
              {actionError && <p className="text-body text-danger" role="alert">{actionError}</p>}
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
              </SectionCard>

              {modal === 'approve' && (
                <ConfirmModal
                  title="지출 승인 (원장 출금 기록)"
                  message={`"${expense.title}" ${won(expense.amount)}을 승인하고 원장에 출금 기록합니다. 진행할까요?`}
                  confirmLabel={`${won(expense.amount)} 승인`}
                  onClose={() => setModal(null)}
                  onConfirm={() => {
                    setModal(null);
                    void sudoAction.run(() => approveExpense.mutateAsync(expense.id), {
                      onError: (caught) => setActionError(apiErrorMessage(caught, '지출 승인에 실패했습니다. 다시 시도해 주세요.')),
                    });
                  }}
                />
              )}
              {modal === 'reject' && (
                <ReasonModal mode="input" title="지출 반려" onClose={() => setModal(null)}
                  onSubmit={(reason) => { rejectExpense.mutate({ id: expense.id, reason }); setModal(null); }} />
              )}
              {modal === 'viewReason' && (
                <ReasonModal mode="view" title="지출 반려 사유" initial={expense.rejectedReason ?? ''} onClose={() => setModal(null)} />
              )}
              {modal === 'edit' && <ExpenseEditModal expense={expense} onClose={() => setModal(null)} />}
              {modal === 'withdraw' && (
                <ConfirmModal
                  title="지출 철회"
                  message={`"${expense.title}" 지출 요청을 철회할까요? 목록·집계에서 사라지고 이력만 DB에 남습니다.`}
                  confirmLabel="철회"
                  danger
                  onClose={() => setModal(null)}
                  onConfirm={() => withdrawExpense.mutate(expense.id, { onSuccess: () => router.push('/expenses') })}
                />
              )}
              {sudoAction.modal}
            </>
          );
        }}
      </DetailStates>
    </div>
  );
}

// [TBO-58 P2] requested 지출 정정 모달 — 생성 폼과 같은 필드(분류·항목·금액·지출일·거래처·메모).
//  성공=닫기, 실패=인라인 에러(서버 400/409 메시지 그대로 — 상태 경합 안내 포함).
function ExpenseEditModal({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const updateExpense = useUpdateExpense();
  const [category, setCategory] = useState<ExpenseCategory>(expense.category);
  const [title, setTitle] = useState(expense.title);
  const [amount, setAmount] = useState(String(expense.amount));
  const [spentAt, setSpentAt] = useState(expense.spentAt);
  const [vendor, setVendor] = useState(expense.vendor ?? '');
  const [memo, setMemo] = useState(expense.memo ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError('항목명을 입력해 주세요.');
    if (!amount || Number(amount) < 0) return setError('금액을 확인해 주세요.');
    updateExpense.mutate({
      id: expense.id,
      patch: {
        category, title: title.trim(), amount: Number(amount), spentAt,
        vendor: vendor.trim() || undefined, memo: memo.trim() || undefined,
      },
    }, {
      onSuccess: onClose,
      onError: (caught) => setError(apiErrorMessage(caught, '수정하지 못했습니다. 다시 시도해 주세요.')), // [75A]
    });
  };

  return (
    <ModalShell title="지출 수정 (승인 전 정정)" onClose={onClose}>
      <form onSubmit={submit} className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="분류 *">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {CATEGORIES.map((c) => (<option key={c} value={c}>{categoryLabel[c]}</option>))}
          </select>
        </Field>
        <Field label="항목명 *"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="금액(원) *"><input className="input" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="지출일 *"><input type="date" className="input" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} /></Field>
        <Field label="거래처"><input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} /></Field>
        <Field label="메모"><input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
        <div className="sm:col-span-2 flex items-center justify-end gap-3 pt-1">
          {error && <p className="text-body text-danger mr-auto" role="alert">{error}</p>}
          <button type="button" className="btn" onClick={onClose}>취소</button>
          <button type="submit" className="btn btn-primary" disabled={updateExpense.isPending}>
            {updateExpense.isPending ? '저장 중...' : '수정 저장'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
