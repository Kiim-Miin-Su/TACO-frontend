'use client';
import { useState } from 'react';
import { Field } from '@/components/ui';
// 읽기(subjects·courses)/쓰기(상담 생성·수정)는 TanStack Query 훅 경유(zustand store 대체).
import { useSubjects, useCourses, useCreateCounsel } from '@/lib/queries';
import { useAccountAccess } from '@/lib/useAccountAccess';
import type {
  CounselSource,
  DesiredStartTime,
  LearningAtmosphere,
  StudentIntention,
} from '@/types';

type Author = 'parent' | 'student' | 'staff';

type FormState = {
  author: Author;
  applicantName: string;
  applicantPhone: string;
  interestSubjectId: string;
  interestCourseId: string;
  desiredStartTime: string;
  learningAtmosphere: string;
  studentIntention: string;
  weakness: string;
  academyExpectation: string;
  dateUndecided: boolean; // 다음 상담일 미정 여부
  nextContactAt: string;  // 다음 상담일(미정 아니면)
};

const empty: FormState = {
  author: 'parent', applicantName: '', applicantPhone: '', interestSubjectId: '',
  interestCourseId: '', desiredStartTime: '', learningAtmosphere: '', studentIntention: '',
  weakness: '', academyExpectation: '',
  dateUndecided: true, nextContactAt: '',
};

// 작성 주체 → source 매핑 (학생/학부모 = 내부폼, 상담실장 = 수기접수)
const sourceOf = (a: Author): CounselSource => (a === 'staff' ? 'manual' : 'internal_form');

export function CounselForm({ onSubmitted }: { onSubmitted?: () => void } = {}) {
  const createCounsel = useCreateCounsel();
  const { account } = useAccountAccess();
  const { data: subjects = [] } = useSubjects();
  const { data: courses = [] } = useCourses();
  const [f, setF] = useState<FormState>(empty);
  const set = (p: Partial<FormState>) => setF((prev) => ({ ...prev, ...p }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.applicantName.trim()) return;
    createCounsel.mutate({
      applicantName: f.applicantName.trim(),
      applicantPhone: f.applicantPhone.trim() || undefined,
      source: sourceOf(f.author),
      submitterType: f.author,
      assignedStaffId: f.author === 'staff' ? account?.id : undefined,
      interestSubjectId: f.interestSubjectId ? Number(f.interestSubjectId) : undefined,
      interestCourseId: f.interestCourseId ? Number(f.interestCourseId) : undefined,
      desiredStartTime: (f.desiredStartTime || undefined) as DesiredStartTime | undefined,
      learningAtmosphere: (f.learningAtmosphere || undefined) as LearningAtmosphere | undefined,
      studentIntention: (f.studentIntention || undefined) as StudentIntention | undefined,
      weakness: f.weakness.trim() || undefined,
      academyExpectation: f.academyExpectation.trim() || undefined,
      nextContactAt: f.dateUndecided ? undefined : f.nextContactAt || undefined,
    }, {
      onSuccess: () => {
        setF({ ...empty, author: f.author });
        onSubmitted?.(); // [IA 3분할] 폼 페이지에서 제출 후 목록으로 이동
      },
    });
  };

  return (
    <form onSubmit={submit} className="space-y-8">
      {/* 종이 서식처럼 섹션으로 나눠 여백을 넉넉히 — 입력 항목이 많아도 한눈에 */}
      <Section title="신청자 정보">
        <Field label="작성 주체">
          <select className="input" value={f.author} onChange={(e) => set({ author: e.target.value as Author })}>
            <option value="parent">학부모</option>
            <option value="student">학생</option>
            <option value="staff">상담실장</option>
          </select>
        </Field>
        <Field label="신청자 이름 *"><input className="input" value={f.applicantName} onChange={(e) => set({ applicantName: e.target.value })} placeholder="한서진" /></Field>
        <Field label="연락처"><input className="input" value={f.applicantPhone} onChange={(e) => set({ applicantPhone: e.target.value })} placeholder="010-0000-0000" /></Field>
      </Section>

      <Section title="관심 · 희망">
        <Field label="관심 과목">
          <select className="input" value={f.interestSubjectId} onChange={(e) => set({ interestSubjectId: e.target.value })}>
            <option value="">선택 안 함</option>
            {subjects.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
          </select>
        </Field>
        <Field label="관심 코스">
          <select className="input" value={f.interestCourseId} onChange={(e) => set({ interestCourseId: e.target.value })}>
            <option value="">선택 안 함</option>
            {courses.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
        </Field>
        <Field label="희망 시작 시기">
          <select className="input" value={f.desiredStartTime} onChange={(e) => set({ desiredStartTime: e.target.value })}>
            <option value="">선택 안 함</option>
            <option value="immediately">즉시</option>
            <option value="within_1_month">1개월 내</option>
            <option value="within_2_3_months">2~3개월</option>
            <option value="undecided">미정</option>
          </select>
        </Field>
      </Section>

      <Section title="학습 성향">
        <Field label="학습 분위기">
          <select className="input" value={f.learningAtmosphere} onChange={(e) => set({ learningAtmosphere: e.target.value })}>
            <option value="">선택 안 함</option>
            <option value="self_directed">자기주도</option>
            <option value="normal">보통</option>
            <option value="needs_management">관리필요</option>
          </select>
        </Field>
        <Field label="학생 의향">
          <select className="input" value={f.studentIntention} onChange={(e) => set({ studentIntention: e.target.value })}>
            <option value="">선택 안 함</option>
            <option value="student_wants">학생 희망</option>
            <option value="parent_only">학부모 주도</option>
            <option value="unknown">미상</option>
          </select>
        </Field>
        <Field label="약점"><input className="input" value={f.weakness} onChange={(e) => set({ weakness: e.target.value })} placeholder="독해 속도 등" /></Field>
      </Section>

      <Section title="예약 · 기대">
        <Field label="다음 상담일" hint="저장 즉시 상담 예약 캘린더에 표시됩니다">
          <div className="flex items-center gap-2">
            <input type="date" className="input flex-1" value={f.nextContactAt} disabled={f.dateUndecided}
              onChange={(e) => set({ nextContactAt: e.target.value })} />
            <label className="flex items-center gap-1 text-caption text-fg-muted whitespace-nowrap">
              <input type="checkbox" checked={f.dateUndecided} onChange={(e) => set({ dateUndecided: e.target.checked, nextContactAt: e.target.checked ? '' : f.nextContactAt })} />
              미정
            </label>
          </div>
        </Field>
        <div className="sm:col-span-2 lg:col-span-3">
          <Field label="학원에 바라는 점">
            <textarea className="input h-24 py-2" value={f.academyExpectation} onChange={(e) => set({ academyExpectation: e.target.value })} placeholder="기대하는 점을 자유롭게 적어주세요" />
          </Field>
        </div>
      </Section>

      <div className="flex justify-end pt-2 border-t border-line-muted">
        <button type="submit" className="btn btn-primary" disabled={createCounsel.isPending || !f.applicantName.trim()}>
          {createCounsel.isPending ? '접수 중…' : '상담 신청'}
        </button>
      </div>
    </form>
  );
}

// 종이 서식 섹션 — 제목 + 넉넉한 그리드(입력 항목이 많은 상담 폼의 가독성)
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-caption font-semibold text-fg-muted uppercase tracking-wide">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4">{children}</div>
    </section>
  );
}
