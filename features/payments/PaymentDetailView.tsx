'use client';
// [B7 E3 2026-07-16] 주 엔티티 단건화(usePayment(id) + DetailStates) — full-list find 제거(EP16)
// [TBO-54 C2 2026-07-23 대표 지시 "원장 수정·반려 주의"] 수납·환불은 **원장 기록 동작** —
//  확인 모달(금액 명시)로만 실행, 환불 버튼 신설(종전 API만 있고 UI 없음), 409(동시 변경)는
//  "다른 기기에서 먼저 처리됨" 안내 + 자동 새로고침(invalidate)으로 복구한다.
import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, ConfirmModal, DetailStates, Field, SectionCard } from '@/components/ui';
import { usePayment, useStudents, useEnrollments, useCourses, useUpdatePayment, useMarkPaymentPaid, useRefundPayment } from '@/lib/queries';
import { useAccountAccess } from '@/lib/useAccountAccess';
import { qk } from '@/lib/queryKeys';
import { apiErrorMessage } from '@/lib/api-error';
import type { PaymentMethod, PaymentStatus } from '@/types';
import { dateOnly, won } from '@/lib/format';
import { statusLabel, statusTone, methodLabel, METHODS, STATUSES } from './labels';

const isConflict = (caught: unknown): boolean =>
  (caught as { response?: { status?: number } })?.response?.status === 409;

export function PaymentDetailView({ paymentId }: { paymentId: number }) {
  const finance = useAccountAccess().can('finance.access');
  const paymentQuery = usePayment(paymentId);
  const queryClient = useQueryClient();
  const { data: students = [] } = useStudents();
  const { data: enrollments = [] } = useEnrollments();
  const { data: courses = [] } = useCourses();
  const updatePayment = useUpdatePayment();
  const markPaid = useMarkPaymentPaid();
  const refund = useRefundPayment();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ amount: '', paymentMethod: '', dueAt: '', status: '' as string });
  const [confirming, setConfirming] = useState<'pay' | 'refund' | null>(null);
  // [E0.6 M] 금전 데이터 저장 신뢰성 — 실패 시 편집 유지+에러 표시, 저장 중 비활성.
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null); // 409 등 비파괴 안내(자동 복구됨)
  const saving = updatePayment.isPending || markPaid.isPending || refund.isPending;

  // [TBO-54 C2] 409 = 다른 인스턴스/기기가 먼저 전이 — 오류가 아니라 "최신화 필요" 안내 + 자동 invalidate.
  const recoverFromConflict = (caught: unknown, fallback: string) => {
    if (isConflict(caught)) {
      setNotice('다른 기기에서 먼저 처리되었습니다 — 최신 상태로 새로고침했습니다.');
      setSaveError(null);
      void queryClient.invalidateQueries({ queryKey: qk.payments.all });
      void queryClient.invalidateQueries({ queryKey: qk.transactions.all });
    } else {
      setNotice(null);
      setSaveError(apiErrorMessage(caught, fallback));
    }
  };

  // usePayment는 finance.access 게이트(enabled) — 비-finance는 isPending이 계속 true라
  // DetailStates보다 **앞에서** 차단해야 무한 skeleton이 아니라 권한 안내가 보인다.
  if (!finance) {
    return (
      <div className="p-6 max-w-[720px] mx-auto">
        <Link href="/" className="text-caption text-fg-muted hover:underline">← 대시보드</Link>
        <div className="mt-3 text-fg-muted">결제 상세는 대표(CEO)만 열람할 수 있습니다.</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[720px] mx-auto space-y-5">
      <DetailStates query={paymentQuery} notFoundMessage={`결제를 찾을 수 없습니다. (id: ${paymentId})`} backHref="/payments">
        {(payment) => {
          const student = students.find((s) => s.id === payment.studentId);
          const enrollment = payment.enrollmentId ? enrollments.find((e) => e.id === payment.enrollmentId) : undefined;
          const course = enrollment ? courses.find((c) => c.id === enrollment.courseId) : undefined;
          const refundable = payment.status === 'paid';
          const payable = payment.status === 'pending' || payment.status === 'overdue';

          const startEdit = () => {
            setDraft({
              amount: String(payment.amount),
              paymentMethod: payment.paymentMethod ?? '',
              dueAt: payment.dueAt ?? '',
              status: payment.status,
            });
            setNotice(null);
            setEditing(true);
          };
          // [E0.6 M 2026-07-16] 종전엔 성공/실패와 무관하게 즉시 편집을 닫아 실패가 조용히 사라졌다(금전 데이터).
          //  → mutateAsync 순차 실행, 실패 시 편집 유지+에러 표시, 성공 시에만 닫기.
          const save = async () => {
            setSaveError(null);
            try {
              // 백엔드 UpdatePaymentInput은 status 미포함(상태 전이는 별도 엔드포인트) → 금액·수단·기한만 patch.
              await updatePayment.mutateAsync({
                id: payment.id,
                patch: {
                  amount: Number(draft.amount) || payment.amount,
                  paymentMethod: (draft.paymentMethod || undefined) as PaymentMethod | undefined,
                  dueAt: draft.dueAt || undefined,
                },
              });
              // 상태를 '완납'으로 바꿨다면 전용 수납 처리(markPaid)로 원장 반영.
              if ((draft.status as PaymentStatus) === 'paid' && payment.status !== 'paid') {
                await markPaid.mutateAsync(payment.id);
              }
              setEditing(false);
            } catch (caught) {
              if (isConflict(caught)) { setEditing(false); recoverFromConflict(caught, ''); return; }
              setSaveError(apiErrorMessage(caught, '저장하지 못했습니다. 다시 시도해 주세요.'));
            }
          };

          return (
            <>
              <div>
                <Link href="/payments" className="text-caption text-fg-muted hover:underline">← 결제 목록</Link>
                <div className="flex items-center gap-2 mt-1">
                  <h1 className="text-title font-bold">{student?.name ?? '결제'} · {won(payment.amount)}</h1>
                  <Badge tone={statusTone[payment.status]}>{statusLabel[payment.status]}</Badge>
                </div>
              </div>

              <SectionCard
                title="결제 상세"
                action={
                  editing ? (
                    <div className="flex gap-1.5">
                      <button className="btn btn-sm" disabled={saving} onClick={() => { setSaveError(null); setEditing(false); }}>취소</button>
                      <button className="btn btn-sm btn-primary" disabled={saving} onClick={save}>{saving ? '저장 중...' : '저장'}</button>
                    </div>
                  ) : (
                    <div className="flex gap-1.5">
                      <button className="btn btn-sm" onClick={startEdit}>수정</button>
                      {payable && (
                        <button className="btn btn-sm btn-primary" disabled={saving} onClick={() => { setNotice(null); setConfirming('pay'); }}>
                          수납 처리
                        </button>
                      )}
                      {refundable && (
                        <button className="btn btn-sm text-danger" disabled={saving} onClick={() => { setNotice(null); setConfirming('refund'); }}>
                          환불
                        </button>
                      )}
                    </div>
                  )
                }
              >
                {editing ? (
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="청구 금액(원)">
                      <input className="input" type="number" min={0} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
                    </Field>
                    <Field label="결제 수단">
                      <select className="input" value={draft.paymentMethod} onChange={(e) => setDraft({ ...draft, paymentMethod: e.target.value })}>
                        <option value="">선택 안 함</option>
                        {METHODS.map((m) => (<option key={m} value={m}>{methodLabel[m]}</option>))}
                      </select>
                    </Field>
                    <Field label="납부 기한">
                      <input type="date" className="input" value={draft.dueAt} onChange={(e) => setDraft({ ...draft, dueAt: e.target.value })} />
                    </Field>
                    <Field label="상태">
                      <select className="input" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                        {STATUSES.map((s) => (<option key={s} value={s}>{statusLabel[s]}</option>))}
                      </select>
                    </Field>
                  </div>
                ) : (
                  <div className="divide-y border-line-muted">
                    {([
                      ['학생', student?.name ?? '—'],
                      ['코스', course?.name ?? '— (직접 청구)'],
                      ['청구 금액', won(payment.amount)],
                      ['수납액', won(payment.paidAmount ?? 0)],
                      ['결제 수단', payment.paymentMethod ? methodLabel[payment.paymentMethod] : '—'],
                      ['납부 기한', dateOnly(payment.dueAt)],
                      ['수납일', dateOnly(payment.paidAt)],
                    ] as [string, string][]).map(([k, v]) => (
                      <div key={k} className="flex px-4 py-3 text-body">
                        <span className="w-32 text-fg-muted">{k}</span>
                        <span className={k.includes('금액') || k.includes('수납액') ? 'mono font-medium' : ''}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
              {notice && <p className="text-body text-fg-muted" role="status">{notice}</p>}
              {saveError && <p className="text-body text-danger" role="alert">{saveError}</p>}
              <p className="text-caption text-fg-subtle">
                수납·환불은 입·출금 원장에 기록됩니다. 원장 기록은 삭제되지 않으며, 정정은 반대 기록(환불)로만 가능합니다.
              </p>

              {confirming === 'pay' && (
                <ConfirmModal
                  title="수납 처리"
                  message={`${student?.name ?? '학생'}의 청구 ${won(payment.amount)}을(를) 수납 처리하고 원장에 입금 기록합니다. 진행할까요?`}
                  confirmLabel={`${won(payment.amount)} 수납`}
                  onClose={() => setConfirming(null)}
                  onConfirm={() => {
                    setConfirming(null);
                    markPaid.mutate(payment.id, {
                      onError: (caught) => recoverFromConflict(caught, '수납 처리에 실패했습니다. 다시 시도해 주세요.'),
                    });
                  }}
                />
              )}
              {confirming === 'refund' && (
                <ConfirmModal
                  title="환불 (원장 출금 기록)"
                  message={`수납액 ${won(payment.paidAmount ?? payment.amount)} 전액을 환불하고 원장에 출금 기록합니다. 원장 기록은 삭제되지 않습니다. 진행할까요?`}
                  confirmLabel={`${won(payment.paidAmount ?? payment.amount)} 환불`}
                  danger
                  onClose={() => setConfirming(null)}
                  onConfirm={() => {
                    setConfirming(null);
                    refund.mutate(payment.id, {
                      onError: (caught) => recoverFromConflict(caught, '환불 처리에 실패했습니다. 다시 시도해 주세요.'),
                    });
                  }}
                />
              )}
            </>
          );
        }}
      </DetailStates>
    </div>
  );
}
