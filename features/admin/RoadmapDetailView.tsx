'use client';
// [TBO-47 2026-07-23] 로드맵 상세 — 단건화(useRoadmap+DetailStates, B7 규약) + 코스 구성 관리.
//  재정렬은 전체 목록 교체(useReorderRoadmapCourses — 서버가 부분 목록 400으로 강제) ·
//  추가/해제는 전용 훅. 표시 파생은 lib/domain/roadmaps SSOT(목록과 동일 함수 소비).
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge, ConfirmModal, DetailStates, EmptyState, Field, ModalShell, PageHeader, SectionCard, TableWrap,
} from '@/components/ui';
import {
  useAddRoadmapCourse, useCourses, useRemoveRoadmap, useRemoveRoadmapCourse, useReorderRoadmapCourses,
  useRoadmap, useSubjects, useUpdateRoadmap,
} from '@/lib/queries';
import type { RoadmapAggregate } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { STUDENT_GRADE_OPTIONS } from '@/lib/domain/students';
import { roadmapDurationLabel, roadmapSequenceLabel, roadmapTargetLabel } from '@/lib/domain/roadmaps';
import { AdminGuard } from './AdminShell';

export function RoadmapDetailView({ roadmapId }: { roadmapId: number }) {
  const roadmapQuery = useRoadmap(roadmapId);
  return (
    <AdminGuard>
      <div className="p-6 max-w-[1100px] mx-auto">
        <DetailStates query={roadmapQuery} notFoundMessage="로드맵을 찾을 수 없습니다." backHref="/admin/roadmaps">
          {(roadmap) => <RoadmapDetailBody roadmap={roadmap} />}
        </DetailStates>
      </div>
    </AdminGuard>
  );
}

function RoadmapDetailBody({ roadmap }: { roadmap: RoadmapAggregate }) {
  const router = useRouter();
  const { data: subjects = [] } = useSubjects();
  const reorder = useReorderRoadmapCourses();
  const removeCourse = useRemoveRoadmapCourse();
  const removeRoadmap = useRemoveRoadmap();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const subjectName = (id: number) => subjects.find((subject) => subject.id === id)?.name ?? '—';
  const busy = reorder.isPending || removeCourse.isPending;

  // ↑/↓ = 인접 스왑 후 전체 courseIds 교체 — 서버 reorder 계약(전체 일치)을 그대로 소비.
  const move = (index: number, delta: -1 | 1) => {
    const next = roadmap.courses.map((course) => course.courseId);
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setActionError(null);
    reorder.mutate({ id: roadmap.id, courseIds: next }, {
      onError: (caught) => setActionError(apiErrorMessage(caught, '순서를 변경하지 못했습니다.')),
    });
  };

  return (
    <>
      <PageHeader
        title={roadmap.title}
        sub={`${roadmapTargetLabel(roadmap.targetGrade)} · ${roadmapDurationLabel(roadmap.durationWeeks)} · 코스 ${roadmap.courses.length}개`}
        actions={
          <>
            <Badge tone={roadmap.isActive ? 'success' : 'neutral'}>{roadmap.isActive ? '활성' : '비활성'}</Badge>
            <button className="btn btn-sm" onClick={() => setEditing(true)}>수정</button>
            <button className="btn btn-sm text-danger" onClick={() => setRemoving(true)}>삭제</button>
            <button className="btn btn-sm" onClick={() => router.push('/admin/roadmaps')}>목록으로</button>
          </>
        }
      />
      <div className="space-y-6">
        <SectionCard title="로드맵 정보">
          <dl className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-body">
            <div><dt className="text-caption text-fg-muted">대상 학년</dt><dd className="font-medium mt-0.5">{roadmapTargetLabel(roadmap.targetGrade)}</dd></div>
            <div><dt className="text-caption text-fg-muted">기간</dt><dd className="font-medium mt-0.5">{roadmapDurationLabel(roadmap.durationWeeks)}</dd></div>
            <div><dt className="text-caption text-fg-muted">코스 수</dt><dd className="font-medium mt-0.5">{roadmap.courses.length}개</dd></div>
            <div><dt className="text-caption text-fg-muted">설명</dt><dd className="font-medium mt-0.5">{roadmap.description || '—'}</dd></div>
          </dl>
          <p className="px-4 pb-4 text-caption text-fg-muted">수강 순서: {roadmapSequenceLabel(roadmap.courses)}</p>
        </SectionCard>

        <SectionCard title={`코스 구성 (${roadmap.courses.length})`}>
          {actionError && <p className="px-4 pt-3 text-caption text-danger" role="alert">{actionError}</p>}
          {roadmap.courses.length === 0 ? (
            <EmptyState message="연결된 코스가 없습니다. 아래에서 코스를 추가하세요." />
          ) : (
            <TableWrap>
              <table className="table">
                <thead><tr><th className="w-16">순서</th><th>코스</th><th>과목</th><th className="text-right">관리</th></tr></thead>
                <tbody>
                  {roadmap.courses.map((course, index) => (
                    <tr key={course.linkId}>
                      <td className="mono">{course.sortOrder + 1}</td>
                      <td className="font-medium">{course.courseName}</td>
                      <td className="text-fg-muted">{subjectName(course.subjectId)}</td>
                      <td className="text-right whitespace-nowrap">
                        <button className="btn btn-sm mr-1" aria-label={`${course.courseName} 순서 위로`}
                          disabled={busy || index === 0} onClick={() => move(index, -1)}>↑</button>
                        <button className="btn btn-sm mr-1.5" aria-label={`${course.courseName} 순서 아래로`}
                          disabled={busy || index === roadmap.courses.length - 1} onClick={() => move(index, 1)}>↓</button>
                        <button className="btn btn-sm text-danger" disabled={busy}
                          onClick={() => {
                            setActionError(null);
                            removeCourse.mutate({ id: roadmap.id, courseId: course.courseId }, {
                              onError: (caught) => setActionError(apiErrorMessage(caught, '코스를 해제하지 못했습니다.')),
                            });
                          }}>해제</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
          <AddCourseRow roadmap={roadmap} onError={setActionError} />
        </SectionCard>
      </div>

      {editing && <RoadmapEditModal roadmap={roadmap} onClose={() => setEditing(false)} />}
      {removing && (
        <ConfirmModal
          title="로드맵 삭제"
          message={`“${roadmap.title}”을(를) 삭제할까요? 연결된 코스 ${roadmap.courses.length}건도 함께 해제됩니다(코스 자체는 유지).`}
          confirmLabel="삭제"
          danger
          onClose={() => setRemoving(false)}
          onConfirm={() => {
            removeRoadmap.mutate(roadmap.id, {
              onSuccess: () => router.push('/admin/roadmaps'),
              onError: (caught) => { setActionError(apiErrorMessage(caught, '로드맵을 삭제하지 못했습니다.')); setRemoving(false); },
            });
          }}
        />
      )}
    </>
  );
}

// 코스 추가 셀렉트 — 이미 연결된 코스는 목록에서 제외(서버도 중복을 409로 이중 방어).
function AddCourseRow({ roadmap, onError }: { roadmap: RoadmapAggregate; onError: (message: string | null) => void }) {
  const { data: courses = [] } = useCourses();
  const addCourse = useAddRoadmapCourse();
  const [courseId, setCourseId] = useState('');
  const linked = useMemo(() => new Set(roadmap.courses.map((course) => course.courseId)), [roadmap.courses]);
  const candidates = courses.filter((course) => !linked.has(course.id));

  return (
    <div className="p-4 border-t flex items-center gap-2 flex-wrap">
      <select className="input h-9 w-64" aria-label="추가할 코스 선택" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
        <option value="">추가할 코스 선택</option>
        {candidates.map((course) => (<option key={course.id} value={course.id}>{course.name}</option>))}
      </select>
      <button className="btn btn-sm btn-primary" disabled={!courseId || addCourse.isPending}
        onClick={() => {
          onError(null);
          addCourse.mutate({ id: roadmap.id, courseId: Number(courseId) }, {
            onSuccess: () => setCourseId(''),
            onError: (caught) => onError(apiErrorMessage(caught, '코스를 추가하지 못했습니다.')),
          });
        }}>
        {addCourse.isPending ? '추가 중…' : '코스 추가'}
      </button>
      {candidates.length === 0 && <span className="text-caption text-fg-muted">추가 가능한 코스가 없습니다(전 코스 연결됨).</span>}
    </div>
  );
}

function RoadmapEditModal({ roadmap, onClose }: { roadmap: RoadmapAggregate; onClose: () => void }) {
  const update = useUpdateRoadmap();
  const [form, setForm] = useState({
    title: roadmap.title,
    description: roadmap.description ?? '',
    targetGrade: roadmap.targetGrade == null ? '' : String(roadmap.targetGrade),
    durationWeeks: roadmap.durationWeeks == null ? '' : String(roadmap.durationWeeks),
    isActive: roadmap.isActive,
  });
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (update.isPending) return;
    setError(null);
    if (!form.title.trim()) { setError('로드맵명을 입력해 주세요.'); return; }
    update.mutate(
      {
        id: roadmap.id,
        patch: {
          title: form.title.trim(),
          description: form.description.trim(),
          targetGrade: form.targetGrade === '' ? null : Number(form.targetGrade), // ''=전체(해제)
          durationWeeks: form.durationWeeks === '' ? null : Number(form.durationWeeks),
          isActive: form.isActive,
        },
      },
      { onSuccess: onClose, onError: (caught) => setError(apiErrorMessage(caught, '저장하지 못했습니다.')) },
    );
  };

  return (
    <ModalShell
      title="로드맵 수정"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          {error && <span className="text-caption text-danger" role="alert">{error}</span>}
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={save} disabled={update.isPending}>{update.isPending ? '저장 중…' : '저장'}</button>
        </div>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="로드맵명 *"><input className="input" data-modal-autofocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="기간(주)"><input className="input" type="number" min={1} max={104} value={form.durationWeeks} onChange={(e) => setForm({ ...form, durationWeeks: e.target.value })} /></Field>
        <Field label="대상 학년">
          <select className="input" value={form.targetGrade} onChange={(e) => setForm({ ...form, targetGrade: e.target.value })}>
            <option value="">전체</option>
            {STUDENT_GRADE_OPTIONS.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
          </select>
        </Field>
        <Field label="활성 여부">
          <label className="flex items-center gap-2 h-9 text-body">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            활성 (목록 상단 노출)
          </label>
        </Field>
        <div className="sm:col-span-2">
          <Field label="설명"><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        </div>
      </div>
    </ModalShell>
  );
}
