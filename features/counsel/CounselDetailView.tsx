'use client';
// [B7 E3 2026-07-16] 주 엔티티 단건화(useCounselForm(id) + DetailStates) — full-list find 제거(EP6/EP11)
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, ConfirmModal, DetailStates, SectionCard, PageHeader, EmptyState, Field } from '@/components/ui';
// 읽기(폼=단건 useCounselForm·회차·과목·코스)/쓰기(수정·상태변경·회차추가)는 TanStack Query 훅 경유(zustand store 대체).
//  useUpdateCounsel의 qk.counsel.all 무효화가 counsel.form(id) 키도 루트 포함으로 자동 갱신(추가 배선 불요 — 확인 완료).
import {
  useCounselForm, useCounselRounds, useSubjects, useCourses,
  useUpdateCounsel, useCreateCounselRound, useRemoveCounsel,
} from '@/lib/queries';
import type {
  CounselStatus,
  DesiredStartTime,
  LearningAtmosphere,
  StudentIntention,
  CounselResult,
  CounselSubmitterType,
  UpdateCounselInput,
} from '@/types';
import {
  statusLabel, statusTone, sourceLabel, resultLabel, resultTone,
  STATUSES, RESULTS,
} from './labels';

export function CounselDetailView({ counselId }: { counselId: number }) {
  const router = useRouter();
  const formQuery = useCounselForm(counselId);
  const { data: rounds = [] } = useCounselRounds();
  const { data: subjects = [] } = useSubjects();
  const { data: courses = [] } = useCourses();
  const updateCounsel = useUpdateCounsel();
  const createRound = useCreateCounselRound();
  const removeCounsel = useRemoveCounsel();

  const [round, setRound] = useState({ summary: '', detail: '', result: '', nextAction: '', nextContactAt: '' });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  return (
    <div className="p-6 max-w-page mx-auto">
      <DetailStates query={formQuery} notFoundMessage="상담카드를 찾을 수 없습니다." backHref="/counsel">
        {(form) => {
          const patch = (body: UpdateCounselInput) => updateCounsel.mutate({ id: form.id, patch: body });
          const formRounds = rounds.filter((r) => r.counselFormId === form.id).sort((a, b) => a.roundNo - b.roundNo);

          const addRound = () => {
            if (!round.summary.trim() && !round.detail.trim()) return;
            createRound.mutate({ formId: form.id, input: {
              counselorId: form.assignedStaffId ?? undefined,
              summary: round.summary.trim() || undefined,
              detail: round.detail.trim() || undefined,
              result: (round.result || undefined) as CounselResult | undefined,
              nextAction: round.nextAction.trim() || undefined,
              nextContactAt: round.nextContactAt || undefined,
            } });
            setRound({ summary: '', detail: '', result: '', nextAction: '', nextContactAt: '' });
          };

          return (
            <div className="space-y-6">
              <div>
                <Link href="/counsel" className="text-caption text-fg-muted hover:underline">← 상담 목록</Link>
                <div className="mt-1">
                  <PageHeader
                    title={`${form.applicantName} 상담카드`}
                    sub={`${sourceLabel[form.source]} · 접수 ${form.createdAt}`}
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

              {/* 편집 가능한 상담카드 */}
              <SectionCard
                title="상담카드 (편집)"
                action={
                  <select className="input btn-sm w-28" value={form.status}
                    onChange={(e) => updateCounsel.mutate({ id: form.id, patch: { status: e.target.value as CounselStatus } })}>
                    {STATUSES.map((s) => (<option key={s} value={s}>{statusLabel[s]}</option>))}
                  </select>
                }
              >
                <div className="px-4 pt-3 text-caption text-fg-subtle">모든 입력은 저장되며, 다음 상담 예약일은 상담 예약 캘린더와 같은 DB 값을 사용합니다.</div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <Field label="신청자 이름"><input className="input" value={form.applicantName} onChange={(e) => patch({ applicantName: e.target.value })} /></Field>
                  <Field label="연락처"><input className="input" value={form.applicantPhone ?? ''} onChange={(e) => patch({ applicantPhone: e.target.value || null })} /></Field>
                  <Field label="작성 주체">
                    <select className="input" value={form.submitterType} onChange={(e) => patch({ submitterType: e.target.value as CounselSubmitterType })}>
                      <option value="parent">학부모</option>
                      <option value="student">학생</option>
                      <option value="staff">직원</option>
                      <option value="unknown">기존 데이터 · 미상</option>
                    </select>
                  </Field>
                  <Field label="다음 상담 예약일">
                    <input type="date" className="input" value={form.nextContactAt ?? ''} onChange={(e) => patch({ nextContactAt: e.target.value || null })} />
                  </Field>
                  <Field label="관심 과목">
                    <select className="input" value={form.interestSubjectId ?? ''} onChange={(e) => patch({ interestSubjectId: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">선택 안 함</option>
                      {subjects.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                    </select>
                  </Field>
                  <Field label="관심 코스">
                    <select className="input" value={form.interestCourseId ?? ''} onChange={(e) => patch({ interestCourseId: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">선택 안 함</option>
                      {courses.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                    </select>
                  </Field>
                  <Field label="희망 시작 시기">
                    <select className="input" value={form.desiredStartTime ?? ''} onChange={(e) => patch({ desiredStartTime: (e.target.value || null) as DesiredStartTime | null })}>
                      <option value="">선택 안 함</option>
                      <option value="immediately">즉시</option>
                      <option value="within_1_month">1개월 내</option>
                      <option value="within_2_3_months">2~3개월</option>
                      <option value="undecided">미정</option>
                    </select>
                  </Field>
                  <Field label="학습 분위기">
                    <select className="input" value={form.learningAtmosphere ?? ''} onChange={(e) => patch({ learningAtmosphere: (e.target.value || null) as LearningAtmosphere | null })}>
                      <option value="">선택 안 함</option>
                      <option value="self_directed">자기주도</option>
                      <option value="normal">보통</option>
                      <option value="needs_management">관리필요</option>
                    </select>
                  </Field>
                  <Field label="학생 의향">
                    <select className="input" value={form.studentIntention ?? ''} onChange={(e) => patch({ studentIntention: (e.target.value || null) as StudentIntention | null })}>
                      <option value="">선택 안 함</option>
                      <option value="student_wants">학생 희망</option>
                      <option value="parent_only">학부모 주도</option>
                      <option value="unknown">미상</option>
                    </select>
                  </Field>
                  <Field label="약점"><input className="input" value={form.weakness ?? ''} onChange={(e) => patch({ weakness: e.target.value || null })} /></Field>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Field label="학원에 바라는 점">
                      <textarea className="input h-16 py-2" value={form.academyExpectation ?? ''} onChange={(e) => patch({ academyExpectation: e.target.value || null })} />
                    </Field>
                  </div>
                </div>
              </SectionCard>

              {/* 상담 회차 (타임라인) */}
              <SectionCard title={`상담 회차 (${formRounds.length}회)`}>
                <div className="divide-y border-line-muted">
                  {formRounds.map((r) => (
                    <div key={r.id} className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="badge badge-neutral">{r.roundNo + 1}차</span>
                        <span className="font-medium text-body">{r.summary ?? '(요약 없음)'}</span>
                        {r.result && <Badge tone={resultTone[r.result]}>{resultLabel[r.result]}</Badge>}
                        <span className="text-micro text-fg-subtle ml-auto">{r.completedAt ?? r.scheduledAt ?? ''}</span>
                      </div>
                      {r.detail && <div className="text-body text-fg-muted whitespace-pre-wrap">{r.detail}</div>}
                      {r.nextAction && <div className="text-caption text-accent mt-1">다음 액션 · {r.nextAction}</div>}
                    </div>
                  ))}
                  {formRounds.length === 0 && <EmptyState message="아직 상담 회차가 없습니다." />}
                </div>

                {/* 회차 추가 */}
                <div className="p-4 border-t space-y-3">
                  <div className="text-caption font-semibold text-fg-muted">상담 회차 추가</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input className="input" placeholder="요약" value={round.summary} onChange={(e) => setRound({ ...round, summary: e.target.value })} />
                    <select className="input" value={round.result} onChange={(e) => setRound({ ...round, result: e.target.value })}>
                      <option value="">결과 선택</option>
                      {RESULTS.map((r) => (<option key={r} value={r}>{resultLabel[r]}</option>))}
                    </select>
                  </div>
                  <textarea className="input h-16 py-2" placeholder="상세 내용" value={round.detail} onChange={(e) => setRound({ ...round, detail: e.target.value })} />
                  <div className="flex gap-3">
                    <input className="input flex-1" placeholder="다음 액션" value={round.nextAction} onChange={(e) => setRound({ ...round, nextAction: e.target.value })} />
                    <input type="date" className="input" aria-label="다음 상담일" value={round.nextContactAt} onChange={(e) => setRound({ ...round, nextContactAt: e.target.value })} />
                    <button className="btn btn-primary" onClick={addRound}>회차 기록</button>
                  </div>
                </div>
              </SectionCard>
              {deleteOpen && (
                <ConfirmModal
                  title="상담카드 삭제"
                  message={`“${form.applicantName}” 상담카드와 연결 회차를 삭제할까요? 삭제 이력은 감사 로그에 남습니다.`}
                  confirmLabel="삭제"
                  danger
                  onClose={() => setDeleteOpen(false)}
                  onConfirm={() => {
                    setDeleteError(null);
                    removeCounsel.mutate(form.id, {
                      onSuccess: () => router.push('/counsel'),
                      onError: (caught) => {
                        const message = (caught as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
                        setDeleteError(Array.isArray(message) ? message.join(' ') : message ?? '상담카드를 삭제하지 못했습니다.');
                        setDeleteOpen(false);
                      },
                    });
                  }}
                />
              )}
            </div>
          );
        }}
      </DetailStates>
    </div>
  );
}
