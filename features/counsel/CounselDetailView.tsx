'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, ConfirmModal, DetailStates, SectionCard, PageHeader, Field } from '@/components/ui';
import {
  useCounselForm,
  useCounselRounds,
  useSubjects,
  useCourses,
  useUpdateCounsel,
  useCreateCounselRound,
  useRemoveCounsel,
} from '@/lib/queries';
import type {
  CounselForm,
  CounselFormSnapshot,
  CounselResult,
  CounselRound,
  UpdateCounselInput,
} from '@/types';
import { CounselPageFields } from './CounselPageFields';
import { snapshotFromForm } from './snapshot';
import { resultLabel, resultTone, RESULTS, sourceLabel, statusLabel, statusTone } from './labels';

type Option = { id: number; name: string };

export function CounselDetailView({ counselId }: { counselId: number }) {
  const formQuery = useCounselForm(counselId);
  const { data: rounds = [] } = useCounselRounds();
  const { data: subjects = [] } = useSubjects();
  const { data: courses = [] } = useCourses();

  return (
    <div className="p-6 max-w-page mx-auto">
      <DetailStates query={formQuery} notFoundMessage="상담카드를 찾을 수 없습니다." backHref="/counsel">
        {(form) => (
          <CounselDetailContent
            form={form}
            rounds={rounds.filter((round) => round.counselFormId === form.id).sort((a, b) => a.roundNo - b.roundNo)}
            subjects={subjects}
            courses={courses}
          />
        )}
      </DetailStates>
    </div>
  );
}

function CounselDetailContent({
  form,
  rounds,
  subjects,
  courses,
}: {
  form: CounselForm;
  rounds: CounselRound[];
  subjects: Option[];
  courses: Option[];
}) {
  const router = useRouter();
  const updateCounsel = useUpdateCounsel();
  const createRound = useCreateCounselRound();
  const removeCounsel = useRemoveCounsel();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const latestSnapshot = rounds[rounds.length - 1]?.formSnapshot ?? snapshotFromForm(form);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/counsel" className="text-caption text-fg-muted hover:underline">← 상담 목록</Link>
        <div className="mt-1">
          <PageHeader
            title={`${form.applicantName} 상담카드`}
            sub={`${sourceLabel[form.source]} · 접수 ${form.createdAt} · 총 ${rounds.length}차`}
            actions={(
              <div className="flex items-center gap-2">
                <Badge tone={statusTone[form.status]}>{statusLabel[form.status]}</Badge>
                <button type="button" className="btn btn-sm text-danger" onClick={() => setDeleteOpen(true)}>삭제</button>
              </div>
            )}
          />
          {deleteError && <p className="mt-2 text-caption text-danger" role="alert">{deleteError}</p>}
        </div>
      </div>

      <EditableInitialPage
        form={form}
        subjects={subjects}
        courses={courses}
        pending={updateCounsel.isPending}
        error={updateCounsel.isError ? '최초 상담 폼을 저장하지 못했습니다.' : null}
        onSave={(patch) => updateCounsel.mutate({ id: form.id, patch })}
      />

      {rounds.map((round) => (
        <HistoryPage key={round.id} round={round} subjects={subjects} courses={courses} />
      ))}

      <NewRoundPage
        key={`new-round-${rounds.length}`}
        form={form}
        initial={latestSnapshot}
        subjects={subjects}
        courses={courses}
        pending={createRound.isPending}
        error={createRound.isError ? '상담 차수를 저장하지 못했습니다.' : null}
        onCreate={(input) => createRound.mutate({ formId: form.id, input })}
      />

      {deleteOpen && (
        <ConfirmModal
          title="상담카드 삭제"
          message={`“${form.applicantName}” 최초 폼과 ${rounds.length}개 차수 페이지를 삭제할까요? 행은 soft delete되고 감사 이력은 유지됩니다.`}
          confirmLabel="삭제"
          danger
          onClose={() => setDeleteOpen(false)}
          onConfirm={() => {
            setDeleteError(null);
            removeCounsel.mutate(form.id, {
              onSuccess: () => router.push('/counsel'),
              onError: () => {
                setDeleteError('상담카드를 삭제하지 못했습니다.');
                setDeleteOpen(false);
              },
            });
          }}
        />
      )}
    </div>
  );
}

function EditableInitialPage({
  form,
  subjects,
  courses,
  pending,
  error,
  onSave,
}: {
  form: CounselForm;
  subjects: Option[];
  courses: Option[];
  pending: boolean;
  error: string | null;
  onSave: (patch: UpdateCounselInput) => void;
}) {
  const [draft, setDraft] = useState(() => snapshotFromForm(form));
  useEffect(() => setDraft(snapshotFromForm(form)), [form]);

  const save = () => onSave({
    applicantName: draft.applicantName,
    applicantPhone: draft.applicantPhone ?? null,
    assignedStaffId: draft.assignedStaffId ?? null,
    status: draft.status,
    source: draft.source,
    submitterType: draft.submitterType,
    interestSubjectId: draft.interestSubjectId ?? null,
    interestCourseId: draft.interestCourseId ?? null,
    academyExpectation: draft.academyExpectation ?? null,
    desiredStartTime: draft.desiredStartTime ?? null,
    learningAtmosphere: draft.learningAtmosphere ?? null,
    studentIntention: draft.studentIntention ?? null,
    weakness: draft.weakness ?? null,
    nextContactAt: draft.nextContactAt ?? null,
  });

  return (
    <SectionCard title="최초 상담 폼 · 수정 가능" action={<span className="text-caption text-fg-subtle">변경 시 audit before/after 기록</span>}>
      <div className="p-4 space-y-4">
        <CounselPageFields value={draft} onChange={setDraft} subjects={subjects} courses={courses} />
        {error && <p className="text-caption text-danger" role="alert">{error}</p>}
        <div className="flex justify-end">
          <button type="button" className="btn btn-primary" disabled={pending || !draft.applicantName.trim()} onClick={save}>
            {pending ? '저장 중…' : '최초 상담 폼 저장'}
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

function HistoryPage({ round, subjects, courses }: { round: CounselRound; subjects: Option[]; courses: Option[] }) {
  return (
    <SectionCard
      title={`${round.roundNo + 1}차 상담 · 저장된 변화 이력`}
      action={round.result ? <Badge tone={resultTone[round.result]}>{resultLabel[round.result]}</Badge> : undefined}
    >
      <div className="p-4 space-y-4">
        <CounselPageFields value={round.formSnapshot} subjects={subjects} courses={courses} readOnly />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-line-muted pt-4">
          <Field label="상담 요약"><div className="text-body whitespace-pre-wrap">{round.summary || '—'}</div></Field>
          <Field label="다음 액션"><div className="text-body whitespace-pre-wrap">{round.nextAction || '—'}</div></Field>
          <div className="sm:col-span-2"><Field label="상담 상세"><div className="text-body whitespace-pre-wrap">{round.detail || '—'}</div></Field></div>
          <div className="text-caption text-fg-subtle">기록일 {round.completedAt ?? round.scheduledAt ?? '—'}</div>
        </div>
      </div>
    </SectionCard>
  );
}

function NewRoundPage({
  form,
  initial,
  subjects,
  courses,
  pending,
  error,
  onCreate,
}: {
  form: CounselForm;
  initial: CounselFormSnapshot;
  subjects: Option[];
  courses: Option[];
  pending: boolean;
  error: string | null;
  onCreate: (input: {
    counselorId?: number;
    summary?: string;
    detail?: string;
    result?: CounselResult;
    nextAction?: string;
    formSnapshot: CounselFormSnapshot;
  }) => void;
}) {
  const [snapshot, setSnapshot] = useState<CounselFormSnapshot>({ ...initial });
  const [notes, setNotes] = useState({ summary: '', detail: '', result: '', nextAction: '' });

  return (
    <SectionCard title="다음 상담 차수 추가" action={<span className="text-caption text-fg-subtle">직전 차수 값을 복사해 변경점만 작성</span>}>
      <div className="p-4 space-y-4">
        <CounselPageFields value={snapshot} onChange={setSnapshot} subjects={subjects} courses={courses} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-line-muted pt-4">
          <Field label="상담 요약"><input className="input" value={notes.summary} onChange={(e) => setNotes({ ...notes, summary: e.target.value })} /></Field>
          <Field label="상담 결과">
            <select className="input" value={notes.result} onChange={(e) => setNotes({ ...notes, result: e.target.value })}>
              <option value="">선택 안 함</option>{RESULTS.map((result) => <option key={result} value={result}>{resultLabel[result]}</option>)}
            </select>
          </Field>
          <Field label="다음 액션"><input className="input" value={notes.nextAction} onChange={(e) => setNotes({ ...notes, nextAction: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="상담 상세"><textarea className="input h-24 py-2" value={notes.detail} onChange={(e) => setNotes({ ...notes, detail: e.target.value })} /></Field></div>
        </div>
        {error && <p className="text-caption text-danger" role="alert">{error}</p>}
        <div className="flex justify-end">
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !snapshot.applicantName.trim()}
            onClick={() => onCreate({
              counselorId: form.assignedStaffId ?? undefined,
              summary: notes.summary.trim() || undefined,
              detail: notes.detail.trim() || undefined,
              result: (notes.result || undefined) as CounselResult | undefined,
              nextAction: notes.nextAction.trim() || undefined,
              formSnapshot: snapshot,
            })}
          >
            {pending ? '저장 중…' : '다음 차수 페이지 저장'}
          </button>
        </div>
      </div>
    </SectionCard>
  );
}
