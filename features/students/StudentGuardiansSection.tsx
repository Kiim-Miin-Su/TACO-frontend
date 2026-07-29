'use client';

import { useState } from 'react';
import { ConfirmModal, EmptyState, Field, SectionCard } from '@/components/ui';
import { useCreateParent, useLinkParent, useParents, useRemoveGuardian, useUpdateParent, useUpdateParentRelation } from '@/lib/queries';
import type { StudentGuardian } from '@/types';
import { GuardianFields } from './GuardianFields';
import { newClientId, serverStudentErrors, type GuardianFormValue } from './student-form-model';

type StudentGuardiansSectionProps = {
  studentId: number;
  guardians: StudentGuardian[];
  canEdit: boolean;
};

export function StudentGuardiansSection({ studentId, guardians, canEdit }: StudentGuardiansSectionProps) {
  const create = useCreateParent();
  const link = useLinkParent();
  const { data: parentRows = [] } = useParents();
  const updateParent = useUpdateParent();
  const updateRelation = useUpdateParentRelation();
  const removeGuardian = useRemoveGuardian();
  const [adding, setAdding] = useState(false);
  const [linking, setLinking] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState('');
  const [draft, setDraft] = useState<GuardianFormValue>(() => emptyGuardian());
  const [editing, setEditing] = useState<StudentGuardian | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StudentGuardian | null>(null);
  const [error, setError] = useState('');

  const startEdit = (guardian: StudentGuardian) => {
    setError('');
    setEditing(guardian);
    setDraft({
      clientId: `guardian-${guardian.relation.id}`,
      name: guardian.parent.name,
      phone: guardian.parent.phone,
      relation: guardian.relation.relation ?? '보호자',
      isPayer: guardian.relation.isPayer,
      isPrimary: guardian.relation.isPrimary,
      kakaoAvailable: guardian.parent.kakaoAvailable,
    });
  };

  const saveNew = () => {
    if (!draft.name.trim() || create.isPending) return setError('보호자 이름을 입력해 주세요.');
    setError('');
    create.mutate({
      studentId,
      name: draft.name.trim(), phone: draft.phone.trim() || undefined, relation: draft.relation.trim() || undefined,
      isPayer: draft.isPayer, isPrimary: draft.isPrimary,
    }, {
      onSuccess: () => { setAdding(false); setDraft(emptyGuardian()); },
      onError: (caught) => setError(serverStudentErrors(caught).message),
    });
  };

  const saveParentProfile = () => {
    if (!editing || !draft.name.trim() || updateParent.isPending) return;
    updateParent.mutate({ id: editing.parent.id, patch: {
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      kakaoAvailable: draft.kakaoAvailable === true,
    } }, {
      onSuccess: () => setEditing(null), onError: (caught) => setError(serverStudentErrors(caught).message),
    });
  };

  const saveRelation = () => {
    if (!editing || updateRelation.isPending) return;
    updateRelation.mutate({ id: editing.relation.id, patch: { relation: draft.relation.trim() || undefined, isPayer: draft.isPayer, isPrimary: draft.isPrimary } }, {
      onSuccess: () => setEditing(null), onError: (caught) => setError(serverStudentErrors(caught).message),
    });
  };

  const saveExisting = () => {
    const parentId = Number(selectedParentId);
    if (!Number.isInteger(parentId) || parentId < 1 || link.isPending) {
      setError('연결할 기존 보호자를 선택해 주세요.');
      return;
    }
    setError('');
    link.mutate({
      parentId,
      studentId,
      relation: draft.relation.trim() || undefined,
      isPayer: draft.isPayer,
      isPrimary: draft.isPrimary,
    }, {
      onSuccess: () => {
        setLinking(false);
        setSelectedParentId('');
        setDraft(emptyGuardian());
      },
      onError: (caught) => setError(serverStudentErrors(caught).message),
    });
  };

  const linkedParentIds = new Set(guardians.map((guardian) => guardian.parent.id));
  const linkCandidates = parentRows.filter((parent) => !linkedParentIds.has(parent.id));

  return (
    <>
      <SectionCard title={`보호자 (${guardians.length})`} action={canEdit && !adding && !linking && !editing ? <div className="flex gap-2 flex-wrap"><button className="btn btn-sm" onClick={() => { setDraft(emptyGuardian()); setAdding(true); }}>신규 등록</button><button className="btn btn-sm" onClick={() => { setDraft(emptyGuardian()); setSelectedParentId(''); setLinking(true); }}>기존 원부 연결</button></div> : undefined}>
        {adding && (
          <div className="space-y-2 mb-4">
            <GuardianFields value={draft} onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))} />
            <div className="flex justify-end gap-2"><button className="btn btn-sm" onClick={() => setAdding(false)}>취소</button><button className="btn btn-sm btn-primary" onClick={saveNew} disabled={create.isPending}>추가</button></div>
          </div>
        )}
        {linking && (
          <div className="space-y-3 mb-4 border border-line-muted rounded-lg p-3">
            <Field label="기존 보호자 *">
              <select className="input" value={selectedParentId} onChange={(event) => setSelectedParentId(event.target.value)}>
                <option value="">보호자를 선택하세요</option>
                {linkCandidates.map((parent) => (
                  <option key={parent.id} value={parent.id}>{parent.name} · {parent.phone || '연락처 없음'}</option>
                ))}
              </select>
            </Field>
            {!linkCandidates.length && <p className="text-caption text-fg-subtle">추가로 연결할 수 있는 기존 보호자가 없습니다.</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="관계"><input className="input" value={draft.relation} onChange={(event) => setDraft((current) => ({ ...current, relation: event.target.value }))} placeholder="모 / 부 / 보호자" /></Field>
              <div className="flex items-end gap-3 pb-2 text-caption text-fg-muted">
                <label className="flex items-center gap-1"><input type="checkbox" checked={draft.isPrimary} onChange={(event) => setDraft((current) => ({ ...current, isPrimary: event.target.checked }))} />주보호자</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={draft.isPayer} onChange={(event) => setDraft((current) => ({ ...current, isPayer: event.target.checked }))} />납부자</label>
              </div>
            </div>
            <div className="flex justify-end gap-2"><button className="btn btn-sm" onClick={() => setLinking(false)}>취소</button><button className="btn btn-sm btn-primary" onClick={saveExisting} disabled={link.isPending || !linkCandidates.length}>연결</button></div>
          </div>
        )}
        {editing && (
          <div className="space-y-2 mb-4">
            <GuardianFields value={draft} onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))} showKakaoAvailable />
            <p className="text-caption text-fg-subtle">보호자 원부와 학생 관계는 각각 독립된 감사 작업으로 저장됩니다.</p>
            <div className="flex justify-end gap-2 flex-wrap">
              <button className="btn btn-sm" onClick={() => setEditing(null)}>취소</button>
              <button className="btn btn-sm" onClick={saveParentProfile} disabled={updateParent.isPending}>이름·연락처 저장</button>
              <button className="btn btn-sm btn-primary" onClick={saveRelation} disabled={updateRelation.isPending}>관계·역할 저장</button>
            </div>
          </div>
        )}
        {error && <p className="mb-3 text-caption text-danger" role="alert">{error}</p>}
        {!guardians.length ? <EmptyState message="연결된 보호자가 없습니다." /> : (
          <div className="divide-y border-line-muted">
            {guardians.map((guardian) => (
              <div key={guardian.relation.id} className="p-3 flex items-center gap-x-3 gap-y-2 flex-wrap text-body">
                <span className="font-medium">{guardian.parent.name}</span>
                <span className="text-caption text-fg-subtle">{guardian.relation.relation ?? '보호자'}{guardian.relation.isPrimary ? ' · 주보호자' : ''}{guardian.relation.isPayer ? ' · 납부자' : ''}</span>
                <span className="text-caption text-fg-subtle">카카오 {guardian.parent.kakaoAvailable ? '수신' : '미수신'}</span>
                <span className="text-fg-muted mono sm:ml-auto">{guardian.parent.phone || '연락처 없음'}</span>
                {canEdit && <><button className="btn btn-sm" onClick={() => startEdit(guardian)}>수정</button><button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(guardian)}>삭제</button></>}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      {deleteTarget && <ConfirmModal
        title={`${deleteTarget.parent.name} 보호자 연결 삭제`}
        message="학생과의 관계를 삭제하고, 다른 학생과 연결되지 않은 보호자 원부는 같은 작업에서 함께 삭제합니다. 모든 이력은 보존됩니다."
        confirmLabel="삭제"
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => removeGuardian.mutate(deleteTarget.relation.id, {
          onSuccess: () => setDeleteTarget(null),
          onError: (caught) => { setError(serverStudentErrors(caught).message); setDeleteTarget(null); },
        })}
      />}
    </>
  );
}

function emptyGuardian(): GuardianFormValue {
  return { clientId: newClientId('guardian'), name: '', phone: '', relation: '보호자', isPayer: true, isPrimary: true };
}
