'use client';

import { useState } from 'react';
import type { InstructorContract } from '@kms545487/contracts';
import { Field, ModalShell } from '@/components/ui';
import { apiErrorMessage } from '@/lib/api-error';
import { useCreateInstructorContract, useUpdateInstructorContract } from '@/lib/queries';
import { useSudoAction } from '@/lib/hooks/useSudoAction';

type ContractForm = {
  monthlyHours: string;
  hourlyRate: string;
  periodStart: string;
  periodEnd: string;
  memo: string;
  active: boolean;
  reason: string;
};

export function InstructorContractModal({
  instructorId,
  contract,
  onClose,
  onSaved,
}: {
  instructorId: number;
  contract?: InstructorContract;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const create = useCreateInstructorContract();
  const update = useUpdateInstructorContract();
  const sudoAction = useSudoAction();
  const [form, setForm] = useState<ContractForm>({
    monthlyHours: String(contract?.monthlyHours ?? 0),
    hourlyRate: String(contract?.hourlyRate ?? 0),
    periodStart: contract?.periodStart ?? '',
    periodEnd: contract?.periodEnd ?? '',
    memo: contract?.memo ?? '',
    active: contract?.active ?? true,
    reason: '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof ContractForm, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const isEdit = contract != null;
  const pending = create.isPending || update.isPending || sudoAction.isPending;
  const valid = Number.isInteger(Number(form.monthlyHours))
    && Number(form.monthlyHours) >= 0
    && Number.isInteger(Number(form.hourlyRate))
    && Number(form.hourlyRate) >= 0
    && !!form.periodStart
    && (!form.periodEnd || form.periodEnd >= form.periodStart)
    && (form.active || !!form.periodEnd)
    && (!isEdit || form.reason.trim().length >= 2);

  const submit = async () => {
    if (!valid || pending) return;
    setError(null);
    try {
      await sudoAction.run(
        () => isEdit
          ? update.mutateAsync({
              id: contract.id,
              patch: {
                monthlyHours: Number(form.monthlyHours),
                hourlyRate: Number(form.hourlyRate),
                periodStart: form.periodStart,
                periodEnd: form.periodEnd || null,
                active: form.active,
                memo: form.memo.trim() || null,
                reason: form.reason.trim(),
              },
            })
          : create.mutateAsync({
              instructorId,
              monthlyHours: Number(form.monthlyHours),
              hourlyRate: Number(form.hourlyRate),
              periodStart: form.periodStart,
              periodEnd: form.periodEnd || null,
              memo: form.memo.trim() || null,
            }),
        {
          onSuccess: () => {
            onSaved(isEdit ? '계약 변경을 DB에 저장했습니다.' : '신규 계약을 DB에 저장했습니다.');
            onClose();
          },
          onError: (caught) => setError(apiErrorMessage(caught, '계약을 저장하지 못했습니다.')),
        },
      );
    } catch {
      // SudoActionCoordinator가 사용자용 오류 상태를 소유한다.
    }
  };

  return (
    <>
      <ModalShell
        title={isEdit ? '강사 계약 변경' : '강사 계약 등록'}
        size="md"
        onClose={onClose}
        footer={(
          <>
            <button type="button" className="btn btn-sm" onClick={onClose} disabled={pending}>취소</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => void submit()} disabled={!valid || pending}>
              {pending ? '저장 중…' : '저장'}
            </button>
          </>
        )}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="월 기준 시수"><input className="input w-full" type="number" min={0} max={100000} value={form.monthlyHours} onChange={(event) => set('monthlyHours', event.target.value)} /></Field>
          <Field label="시간당 시급(원)"><input className="input w-full" type="number" min={0} max={100000000} value={form.hourlyRate} onChange={(event) => set('hourlyRate', event.target.value)} /></Field>
          <Field label="계약 시작일"><input className="input w-full" type="date" value={form.periodStart} onChange={(event) => set('periodStart', event.target.value)} /></Field>
          <Field label="계약 종료일"><input className="input w-full" type="date" min={form.periodStart || undefined} value={form.periodEnd} onChange={(event) => set('periodEnd', event.target.value)} /></Field>
          <Field label="메모"><input className="input w-full" maxLength={1000} value={form.memo} onChange={(event) => set('memo', event.target.value)} /></Field>
          {isEdit && (
            <Field label="계약 상태">
              <label className="h-10 flex items-center gap-2">
                <input type="checkbox" checked={form.active} onChange={(event) => set('active', event.target.checked)} />
                <span className="text-body">활성 계약</span>
              </label>
            </Field>
          )}
          {isEdit && (
            <div className="sm:col-span-2">
              <Field label="변경 사유"><textarea className="input w-full min-h-20" maxLength={1000} value={form.reason} onChange={(event) => set('reason', event.target.value)} required /></Field>
            </div>
          )}
        </div>
        {form.periodEnd && form.periodEnd < form.periodStart && <p className="mt-3 text-caption text-danger" role="alert">종료일은 시작일보다 빠를 수 없습니다.</p>}
        {!form.active && !form.periodEnd && <p className="mt-3 text-caption text-danger" role="alert">계약을 종료하려면 종료일을 입력해 주세요.</p>}
        {error && <p className="mt-3 text-caption text-danger" role="alert">{error}</p>}
        <p className="mt-3 text-caption text-fg-subtle">계약 변경은 대표 재인증 후 적용되며 변경 전후 값과 사유가 감사 이력에 남습니다.</p>
      </ModalShell>
      {sudoAction.modal}
    </>
  );
}
