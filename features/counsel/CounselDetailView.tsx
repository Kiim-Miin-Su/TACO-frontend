'use client';
// [B7 E3 2026-07-16] 주 엔티티 단건화(useCounselForm(id) + DetailStates) — full-list find 제거(EP6/EP11)
import { useState } from 'react';
import Link from 'next/link';
import { Badge, DetailStates, SectionCard, PageHeader, EmptyState, Field } from '@/components/ui';
// 읽기(폼=단건 useCounselForm·회차·과목·코스)/쓰기(수정·상태변경·회차추가)는 TanStack Query 훅 경유(zustand store 대체).
//  useUpdateCounsel의 qk.counsel.all 무효화가 counsel.form(id) 키도 루트 포함으로 자동 갱신(추가 배선 불요 — 확인 완료).
import {
  useCounselForm, useCounselRounds, useSubjects, useCourses,
  useUpdateCounsel, useCreateCounselRound,
} from '@/lib/queries';
import type {
  CounselStatus,
  DesiredStartTime,
  LearningAtmosphere,
  StudentIntention,
  CounselResult,
  UpdateCounselInput,
} from '@/types';
import {
  statusLabel, statusTone, sourceLabel, resultLabel, resultTone,
  STATUSES, RESULTS,
} from './labels';

export function CounselDetailView({ counselId }: { counselId: number }) {
  const formQuery = useCounselForm(counselId);
  const { data: rounds = [] } = useCounselRounds();
  const { data: subjects = [] } = useSubjects();
  const { data: courses = [] } = useCourses();
  const updateCounsel = useUpdateCounsel();
  const createRound = useCreateCounselRound();

  const [round, setRound] = useState({ summary: '', detail: '', result: '', nextAction: '' });

  return (
    <div className="p-6 max-w-page mx-auto">
      <DetailStates query={formQuery} notFoundMessage="상담카드를 찾을 수 없습니다." backHref="/counsel">
        {(form) => {
          // 백엔드 UpdateCounselInput은 일부 필드(status·담당·관심과목/코스·기대·약점)만 허용 → 허용 키만 전송.
          //  (applicantName/phone·다음상담일·희망시기 등은 백엔드 patch 미지원: 폼 UI는 유지하되 전송되지 않음)
          const patch = (p: Partial<typeof form>) => {
            const allowed: (keyof UpdateCounselInput)[] = [
              'status', 'assignedStaffId', 'interestSubjectId', 'interestCourseId', 'academyExpectation', 'weakness',
            ];
            const body: UpdateCounselInput = {};
            for (const k of allowed) {
              if (k in p && p[k] !== undefined) (body as Record<string, unknown>)[k] = p[k as keyof typeof p];
            }
            if (Object.keys(body).length) updateCounsel.mutate({ id: form.id, patch: body });
          };
          const formRounds = rounds.filter((r) => r.counselFormId === form.id).sort((a, b) => a.roundNo - b.roundNo);

          const addRound = () => {
            if (!round.summary.trim() && !round.detail.trim()) return;
            createRound.mutate({ formId: form.id, input: {
              counselorId: form.assignedStaffId,
              summary: round.summary.trim() || undefined,
              detail: round.detail.trim() || undefined,
              result: (round.result || undefined) as CounselResult | undefined,
              nextAction: round.nextAction.trim() || undefined,
            } });
            setRound({ summary: '', detail: '', result: '', nextAction: '' });
          };

          return (
            <div className="space-y-6">
              <div>
                <Link href="/counsel" className="text-caption text-fg-muted hover:underline">← 상담 목록</Link>
                <div className="mt-1">
                  <PageHeader
                    title={`${form.applicantName} 상담카드`}
                    sub={`${sourceLabel[form.source]} · 접수 ${form.createdAt}`}
                    actions={<Badge tone={statusTone[form.status]}>{statusLabel[form.status]}</Badge>}
                  />
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
                {/* [TBO-17] 저장 지원 필드 명시 — 백엔드 UpdateCounselInput 미지원 항목은 표시용(DB 이관 후 확장 예정) */}
                <div className="px-4 pt-3 text-caption text-fg-subtle">ⓘ 현재 저장: 상태·담당·관심 과목/코스·약점·학원 기대. 이름·연락처·예약일·희망시기·분위기·의향은 표시용(DB 이관 후 저장 지원).</div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <Field label="신청자 이름"><input className="input" value={form.applicantName} onChange={(e) => patch({ applicantName: e.target.value })} /></Field>
                  <Field label="연락처"><input className="input" value={form.applicantPhone ?? ''} onChange={(e) => patch({ applicantPhone: e.target.value })} /></Field>
                  <Field label="다음 상담 예약일">
                    <input type="date" className="input" value={form.nextContactAt ?? ''} onChange={(e) => patch({ nextContactAt: e.target.value || undefined })} />
                  </Field>
                  <Field label="관심 과목">
                    <select className="input" value={form.interestSubjectId ?? ''} onChange={(e) => patch({ interestSubjectId: e.target.value ? Number(e.target.value) : undefined })}>
                      <option value="">선택 안 함</option>
                      {subjects.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                    </select>
                  </Field>
                  <Field label="관심 코스">
                    <select className="input" value={form.interestCourseId ?? ''} onChange={(e) => patch({ interestCourseId: e.target.value ? Number(e.target.value) : undefined })}>
                      <option value="">선택 안 함</option>
                      {courses.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                    </select>
                  </Field>
                  <Field label="희망 시작 시기">
                    <select className="input" value={form.desiredStartTime ?? ''} onChange={(e) => patch({ desiredStartTime: (e.target.value || undefined) as DesiredStartTime | undefined })}>
                      <option value="">선택 안 함</option>
                      <option value="immediately">즉시</option>
                      <option value="within_1_month">1개월 내</option>
                      <option value="within_2_3_months">2~3개월</option>
                      <option value="undecided">미정</option>
                    </select>
                  </Field>
                  <Field label="학습 분위기">
                    <select className="input" value={form.learningAtmosphere ?? ''} onChange={(e) => patch({ learningAtmosphere: (e.target.value || undefined) as LearningAtmosphere | undefined })}>
                      <option value="">선택 안 함</option>
                      <option value="self_directed">자기주도</option>
                      <option value="normal">보통</option>
                      <option value="needs_management">관리필요</option>
                    </select>
                  </Field>
                  <Field label="학생 의향">
                    <select className="input" value={form.studentIntention ?? ''} onChange={(e) => patch({ studentIntention: (e.target.value || undefined) as StudentIntention | undefined })}>
                      <option value="">선택 안 함</option>
                      <option value="student_wants">학생 희망</option>
                      <option value="parent_only">학부모 주도</option>
                      <option value="unknown">미상</option>
                    </select>
                  </Field>
                  <Field label="약점"><input className="input" value={form.weakness ?? ''} onChange={(e) => patch({ weakness: e.target.value || undefined })} /></Field>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Field label="학원에 바라는 점">
                      <textarea className="input h-16 py-2" value={form.academyExpectation ?? ''} onChange={(e) => patch({ academyExpectation: e.target.value || undefined })} />
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
                    <button className="btn btn-primary" onClick={addRound}>회차 기록</button>
                  </div>
                </div>
              </SectionCard>
            </div>
          );
        }}
      </DetailStates>
    </div>
  );
}
