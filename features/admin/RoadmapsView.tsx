'use client';
// [TBO-47 2026-07-23] 수강 로드맵 목록 — 마지막 dormant 도메인 실구현(대표 지시 "서비스 실 구현").
//  규약: 읽기=useRoadmaps(aggregate — 코스 조인은 서버 파생, 화면 자체 조인 금지), 쓰기=중앙 훅만.
//  표시 파생(대상·기간·코스 순서 라벨)은 lib/domain/roadmaps SSOT를 목록·상세가 같이 소비한다.
import Link from 'next/link';
import { useState } from 'react';
import {
  Badge, ClickableTableRow, ConfirmModal, EmptyState, Field, LoadingState, ModalShell,
  SearchableCheckList, SectionCard, TableWrap,
} from '@/components/ui';
import { useCourses, useCreateRoadmap, useRemoveRoadmap, useRoadmaps } from '@/lib/queries';
import { apiErrorMessage } from '@/lib/api-error';
import { STUDENT_GRADE_OPTIONS } from '@/lib/domain/students';
import { roadmapDurationLabel, roadmapSequenceLabel, roadmapTargetLabel } from '@/lib/domain/roadmaps';
import { AdminGuard, AdminHeader } from './AdminShell';

export function RoadmapsView() {
  const { data: roadmaps = [], isPending: loading } = useRoadmaps();
  const removeRoadmap = useRemoveRoadmap();
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<{ id: number; title: string; courseCount: number } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  return (
    <AdminGuard>
      <div className="p-6 max-w-page mx-auto space-y-6">
        <AdminHeader />
        <SectionCard
          title={`로드맵 목록 (${roadmaps.length})`}
          action={<button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}>로드맵 추가</button>}
        >
          {actionError && <p className="px-4 pt-3 text-caption text-danger" role="alert">{actionError}</p>}
          {loading ? (
            <LoadingState />
          ) : roadmaps.length === 0 ? (
            <EmptyState message="등록된 로드맵이 없습니다. 우측 상단에서 로드맵을 추가하세요." />
          ) : (
            <TableWrap>
              <table className="table">
                <thead><tr><th>로드맵</th><th>대상</th><th>기간</th><th>코스 구성 (순서)</th><th>상태</th><th className="text-right">관리</th></tr></thead>
                <tbody>
                  {roadmaps.map((roadmap) => (
                    <ClickableTableRow key={roadmap.id} href={`/admin/roadmaps/${roadmap.id}`} label={`${roadmap.title} 로드맵 상세`}>
                      <td className="font-medium">
                        <Link href={`/admin/roadmaps/${roadmap.id}`} className="text-accent hover:underline">{roadmap.title}</Link>
                        {roadmap.description && <div className="text-micro text-fg-subtle truncate max-w-[320px]">{roadmap.description}</div>}
                      </td>
                      <td className="text-fg-muted">{roadmapTargetLabel(roadmap.targetGrade)}</td>
                      <td className="text-fg-muted">{roadmapDurationLabel(roadmap.durationWeeks)}</td>
                      <td className="text-fg-muted max-w-[380px] truncate" title={roadmapSequenceLabel(roadmap.courses)}>
                        {roadmapSequenceLabel(roadmap.courses)}
                      </td>
                      <td><Badge tone={roadmap.isActive ? 'success' : 'neutral'}>{roadmap.isActive ? '활성' : '비활성'}</Badge></td>
                      <td className="text-right whitespace-nowrap">
                        <button className="btn btn-sm text-danger"
                          onClick={() => setRemoving({ id: roadmap.id, title: roadmap.title, courseCount: roadmap.courses.length })}>
                          삭제
                        </button>
                      </td>
                    </ClickableTableRow>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </SectionCard>

        {creating && <RoadmapCreateModal onClose={() => setCreating(false)} />}
        {removing && (
          <ConfirmModal
            title="로드맵 삭제"
            message={`“${removing.title}”을(를) 삭제할까요? 연결된 코스 ${removing.courseCount}건도 함께 해제됩니다(코스 자체는 유지).`}
            confirmLabel="삭제"
            danger
            onClose={() => setRemoving(null)}
            onConfirm={() => {
              setActionError(null);
              removeRoadmap.mutate(removing.id, {
                onSuccess: () => setRemoving(null),
                onError: (caught) => { setActionError(apiErrorMessage(caught, '로드맵을 삭제하지 못했습니다.')); setRemoving(null); },
              });
            }}
          />
        )}
      </div>
    </AdminGuard>
  );
}

// 생성 모달 — 코스는 선택 순서대로 sortOrder 연결(서버 한 tx). 세부 재정렬은 상세 화면 ↑/↓.
function RoadmapCreateModal({ onClose }: { onClose: () => void }) {
  const { data: courses = [] } = useCourses();
  const createRoadmap = useCreateRoadmap();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetGrade, setTargetGrade] = useState(''); // ''=전체(미지정)
  const [durationWeeks, setDurationWeeks] = useState('');
  const [courseIds, setCourseIds] = useState<number[]>([]); // 클릭 순서 = 연결 순서
  const [formError, setFormError] = useState<string | null>(null);

  const toggleCourse = (id: number) =>
    setCourseIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  const courseName = (id: number) => courses.find((c) => c.id === id)?.name ?? `코스 #${id}`;

  const submit = () => {
    if (createRoadmap.isPending) return;
    setFormError(null);
    if (!title.trim()) { setFormError('로드맵명을 입력해 주세요.'); return; }
    createRoadmap.mutate(
      {
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(targetGrade !== '' ? { targetGrade: Number(targetGrade) } : {}),
        ...(durationWeeks !== '' ? { durationWeeks: Number(durationWeeks) } : {}),
        ...(courseIds.length ? { courseIds } : {}),
      },
      {
        onSuccess: () => onClose(),
        onError: (caught) => setFormError(apiErrorMessage(caught, '로드맵을 추가하지 못했습니다. 다시 시도해 주세요.')),
      },
    );
  };

  return (
    <ModalShell
      title="로드맵 추가"
      size="md"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          {formError && <span className="text-caption text-danger" role="alert">{formError}</span>}
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={submit} disabled={createRoadmap.isPending}>
            {createRoadmap.isPending ? '추가 중…' : '로드맵 추가'}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="로드맵명 *"><input className="input" data-modal-autofocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="SAT 완성 12주" /></Field>
        <Field label="기간(주)"><input className="input" type="number" min={1} max={104} value={durationWeeks} onChange={(e) => setDurationWeeks(e.target.value)} placeholder="12" /></Field>
        <Field label="대상 학년">
          <select className="input" value={targetGrade} onChange={(e) => setTargetGrade(e.target.value)}>
            <option value="">전체</option>
            {STUDENT_GRADE_OPTIONS.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
          </select>
        </Field>
        <Field label="설명"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Reading → TOEFL 병행 코스 묶음" /></Field>
        <div className="sm:col-span-2">
          <Field label={`코스 구성 (선택 순서 = 수강 순서 · ${courseIds.length}개 선택)`}>
            <SearchableCheckList
              items={courses.map((course) => ({ id: course.id, name: course.name }))}
              selected={new Set(courseIds)}
              onToggle={toggleCourse}
              placeholder="코스 검색"
              emptyMessage="검색되는 코스가 없습니다"
            />
          </Field>
          {courseIds.length > 0 && (
            <p className="mt-1.5 text-caption text-fg-muted">
              순서: {courseIds.map((id, index) => `${index + 1}. ${courseName(id)}`).join(' → ')}
            </p>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
