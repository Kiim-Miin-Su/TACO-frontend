'use client';

import { useState } from 'react';
import { ConfirmModal, EmptyState, Field, SectionCard } from '@/components/ui';
import {
  useCreateStudentAcademicHistory,
  useRemoveStudentAcademicHistory,
  useUpdateStudentAcademicHistory,
} from '@/lib/queries';
import type { StudentAcademicHistory } from '@/types';
import { StudentGradeField } from './StudentGradeField';

type Draft = { grade: string; schoolName: string; startedOn: string; endedOn: string };
const emptyDraft = (): Draft => ({ grade: '', schoolName: '', startedOn: '', endedOn: '' });

export function StudentAcademicHistoriesSection({ studentId, histories, canEdit }: { studentId: number; histories: StudentAcademicHistory[]; canEdit: boolean }) {
  const create = useCreateStudentAcademicHistory();
  const update = useUpdateStudentAcademicHistory();
  const remove = useRemoveStudentAcademicHistory();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<StudentAcademicHistory | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [deleteTarget, setDeleteTarget] = useState<StudentAcademicHistory | null>(null);
  const [error, setError] = useState('');

  const valid = draft.grade !== '' && draft.schoolName.trim() && draft.startedOn && (!draft.endedOn || draft.startedOn <= draft.endedOn);
  const input = () => ({ grade: Number(draft.grade), schoolName: draft.schoolName.trim(), startedOn: draft.startedOn, endedOn: draft.endedOn || null });
  const startEdit = (history: StudentAcademicHistory) => {
    setEditing(history); setAdding(false); setDraft({ grade: String(history.grade), schoolName: history.schoolName, startedOn: history.startedOn, endedOn: history.endedOn ?? '' }); setError('');
  };

  const editor = (mode: 'create' | 'update') => <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
    <StudentGradeField compact value={draft.grade} onChange={(grade) => setDraft((current) => ({ ...current, grade }))} />
    <Field label="학교"><input className="input" value={draft.schoolName} onChange={(event) => setDraft((current) => ({ ...current, schoolName: event.target.value }))} /></Field>
    <Field label="시작일"><input type="date" className="input" value={draft.startedOn} onChange={(event) => setDraft((current) => ({ ...current, startedOn: event.target.value }))} /></Field>
    <Field label="종료일 (미정 가능)"><input type="date" className="input" value={draft.endedOn} onChange={(event) => setDraft((current) => ({ ...current, endedOn: event.target.value }))} /></Field>
    <div className="sm:col-span-4 flex justify-end gap-2"><button className="btn btn-sm" onClick={() => { setAdding(false); setEditing(null); }}>취소</button><button className="btn btn-sm btn-primary" disabled={!valid || create.isPending || update.isPending} onClick={() => {
      if (mode === 'create') create.mutate({ studentId, input: input() }, { onSuccess: () => { setAdding(false); setDraft(emptyDraft()); }, onError: () => setError('기간이 겹치거나 입력값이 올바르지 않습니다.') });
      else if (editing) update.mutate({ studentId, historyId: editing.id, input: input() }, { onSuccess: () => setEditing(null), onError: () => setError('학교·학년 이력을 수정하지 못했습니다.') });
    }}>{mode === 'create' ? '추가' : '저장'}</button></div>
  </div>;

  return <>
    <SectionCard title={`학교·학년 이력 (${histories.length})`} action={canEdit && !adding && !editing ? <button className="btn btn-sm" onClick={() => { setDraft(emptyDraft()); setAdding(true); }}>+ 이력 추가</button> : undefined}>
      {adding && editor('create')}{editing && editor('update')}
      {error && <p className="mb-3 text-caption text-danger" role="alert">{error}</p>}
      {!histories.length ? <EmptyState message="학교·학년 이력이 없습니다." /> : <div className="divide-y border-line-muted">
        {histories.map((history) => <div key={history.id} className="p-3 flex items-center gap-3 flex-wrap"><span className="font-medium">{history.grade === 0 ? 'Kinder' : `G${history.grade}`}</span><span>{history.schoolName}</span><span className="text-caption text-fg-muted mono">{history.startedOn} ~ {history.endedOn ?? '현재·미래'}</span>{canEdit && <span className="sm:ml-auto flex gap-2"><button className="btn btn-sm" onClick={() => startEdit(history)}>수정</button><button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(history)}>삭제</button></span>}</div>)}
      </div>}
    </SectionCard>
    {deleteTarget && <ConfirmModal title="학교·학년 이력 삭제" message={`${deleteTarget.schoolName} 이력을 삭제할까요? 감사 이력은 유지됩니다.`} confirmLabel="삭제" danger onClose={() => setDeleteTarget(null)} onConfirm={() => remove.mutate({ studentId, historyId: deleteTarget.id }, { onSuccess: () => setDeleteTarget(null), onError: () => { setError('이력을 삭제하지 못했습니다.'); setDeleteTarget(null); } })} />}
  </>;
}
