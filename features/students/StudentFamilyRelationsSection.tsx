'use client';

import { useMemo, useState } from 'react';
import { ConfirmModal, EmptyState, Field, ModalShell, SectionCard } from '@/components/ui';
import {
  useCreateStudentFamilyRelation,
  useRemoveStudentFamilyRelation,
  useStudents,
  useUpdateStudentFamilyRelation,
} from '@/lib/queries';
import type { StudentFamilyRelation } from '@/types';
import { StudentSearchSelect } from './StudentSearchSelect';

export function StudentFamilyRelationsSection({
  studentId,
  relations,
  canEdit,
}: {
  studentId: number;
  relations: StudentFamilyRelation[];
  canEdit: boolean;
}) {
  const { data: students = [] } = useStudents();
  const create = useCreateStudentFamilyRelation();
  const update = useUpdateStudentFamilyRelation();
  const remove = useRemoveStudentFamilyRelation();
  const [adding, setAdding] = useState(false);
  const [relatedStudentId, setRelatedStudentId] = useState('');
  const [relationType, setRelationType] = useState<'sibling' | 'other'>('sibling');
  const [relationLabel, setRelationLabel] = useState('');
  const [editing, setEditing] = useState<StudentFamilyRelation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StudentFamilyRelation | null>(null);
  const [error, setError] = useState('');
  const studentById = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);
  const excludedIds = useMemo(
    () => new Set([studentId, ...relations.flatMap((relation) => [relation.studentIdA, relation.studentIdB])]),
    [relations, studentId],
  );

  const relatedName = (relation: StudentFamilyRelation) => {
    const relatedId = relation.studentIdA === studentId ? relation.studentIdB : relation.studentIdA;
    return studentById.get(relatedId)?.name ?? `학생 #${relatedId}`;
  };

  const submitCreate = () => {
    if (!relatedStudentId) return setError('연결할 학생을 선택해 주세요.');
    if (relationType === 'other' && !relationLabel.trim()) return setError('기타 관계명을 입력해 주세요.');
    setError('');
    create.mutate({
      studentId,
      input: {
        relatedStudentId: Number(relatedStudentId), relationType,
        ...(relationType === 'other' ? { relationLabel: relationLabel.trim() } : {}),
      },
    }, {
      onSuccess: () => { setAdding(false); setRelatedStudentId(''); setRelationType('sibling'); setRelationLabel(''); },
      onError: () => setError('가족 관계를 추가하지 못했습니다.'),
    });
  };

  return (
    <>
      <SectionCard title={`가족 등록 (${relations.length})`} action={canEdit && !adding ? <button className="btn btn-sm" onClick={() => {
        setRelatedStudentId('');
        setRelationType('sibling');
        setRelationLabel('');
        setError('');
        setAdding(true);
      }}>+ 가족 추가</button> : undefined}>
        {error && <p className="mb-3 text-caption text-danger" role="alert">{error}</p>}
        {!relations.length ? <EmptyState message="연결된 가족 학생이 없습니다." /> : <div className="divide-y border-line-muted">
          {relations.map((relation) => <div key={relation.id} className="p-3 flex items-center gap-3 flex-wrap">
            <span className="font-medium">{relatedName(relation)}</span>
            {editing?.id === relation.id ? <>
              <select className="input w-auto" value={relationType} onChange={(event) => setRelationType(event.target.value as 'sibling' | 'other')}><option value="sibling">형제·자매</option><option value="other">기타</option></select>
              {relationType === 'other' && <input className="input w-40" value={relationLabel} onChange={(event) => setRelationLabel(event.target.value)} />}
              <button className="btn btn-sm btn-primary" onClick={() => update.mutate({ studentId, relationId: relation.id, input: { relationType, ...(relationType === 'other' ? { relationLabel: relationLabel.trim() } : {}) } }, { onSuccess: () => setEditing(null), onError: () => setError('가족 관계를 수정하지 못했습니다.') })}>저장</button>
              <button className="btn btn-sm" onClick={() => setEditing(null)}>취소</button>
            </> : <>
              <span className="text-caption text-fg-muted">{relation.relationType === 'sibling' ? '형제·자매' : relation.relationLabel}</span>
              {canEdit && <span className="sm:ml-auto flex gap-2"><button className="btn btn-sm" onClick={() => { setEditing(relation); setRelationType(relation.relationType); setRelationLabel(relation.relationLabel ?? ''); }}>수정</button><button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(relation)}>삭제</button></span>}
            </>}
          </div>)}
        </div>}
      </SectionCard>
      {adding && <ModalShell title="등록 학생 검색 · 가족 연결" size="md" onClose={() => setAdding(false)} footer={<><button className="btn" onClick={() => setAdding(false)}>취소</button><button className="btn btn-primary" disabled={create.isPending || !relatedStudentId} onClick={submitCreate}>{create.isPending ? '연결 중…' : '가족 연결'}</button></>}>
        <div className="space-y-4">
          <StudentSearchSelect students={students} value={relatedStudentId ? Number(relatedStudentId) : null} onChange={(id) => setRelatedStudentId(id == null ? '' : String(id))} excludeIds={excludedIds} autoFocus />
          <Field label="가족 관계"><select className="input" value={relationType} onChange={(event) => setRelationType(event.target.value as 'sibling' | 'other')}><option value="sibling">형제·자매</option><option value="other">기타</option></select></Field>
          {relationType === 'other' && <Field label="기타 관계명"><input className="input" value={relationLabel} onChange={(event) => setRelationLabel(event.target.value)} /></Field>}
          {error && <p className="text-caption text-danger" role="alert">{error}</p>}
        </div>
      </ModalShell>}
      {deleteTarget && <ConfirmModal title="가족 관계 삭제" message={`${relatedName(deleteTarget)} 학생과의 가족 연결을 삭제할까요? 감사 이력은 유지됩니다.`} confirmLabel="삭제" danger onClose={() => setDeleteTarget(null)} onConfirm={() => remove.mutate({ studentId, relationId: deleteTarget.id }, { onSuccess: () => setDeleteTarget(null), onError: () => { setError('가족 관계를 삭제하지 못했습니다.'); setDeleteTarget(null); } })} />}
    </>
  );
}
