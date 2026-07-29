'use client';
import { useState } from 'react';
import { Field } from '@/components/ui';
// 읽기(subjects·courses)/쓰기(상담 생성·수정)는 TanStack Query 훅 경유(zustand store 대체).
import { useCourses, useCreateCounsel, useCreateStudentCounselIntake, useStudents, useStudentFamily } from '@/lib/queries';
import { StudentSearchSelect } from '@/features/students/StudentSearchSelect';
import { StudentRegistrationFields } from '@/features/students/StudentRegistrationFields';
import { serverStudentErrors } from '@/features/students/student-form-model';
import { useStudentRegistrationDraft } from '@/features/students/useStudentRegistrationDraft';
// [TBO-30G] 가족 조인 단일 진실원 — 학생 상세·상담 상세와 같은 훅·같은 파생 헬퍼 소비(사본 정의 금지)
import Link from 'next/link';
import { familyCounselCount, familyMemberSub, familyRelationLabel } from '@/features/students/family-shared';
import { internalRoute } from '@/lib/navigation-security';
import { CounselContentField, CounselNextContactField } from './CounselSharedFields';

type FormState = {
  studentId: number | null;
  referenceNotes: string;
  nextContactAt: string | null;
};

const empty: FormState = {
  studentId: null,
  referenceNotes: '',
  nextContactAt: null,
};

type ApplicantMode = 'existing' | 'new';

export function CounselForm({
  onSubmitted,
  initialMode = 'existing',
}: {
  onSubmitted?: () => void;
  initialMode?: ApplicantMode;
} = {}) {
  const createCounsel = useCreateCounsel();
  const createIntake = useCreateStudentCounselIntake();
  const { data: students = [] } = useStudents();
  const { data: courses = [] } = useCourses();
  const draft = useStudentRegistrationDraft();
  const [mode, setMode] = useState<ApplicantMode>(initialMode);
  const [f, setF] = useState<FormState>(empty);
  const [message, setMessage] = useState('');
  const set = (p: Partial<FormState>) => setF((prev) => ({ ...prev, ...p }));
  const selectedStudent = f.studentId == null
    ? undefined
    : students.find((student) => student.id === f.studentId);
  // [TBO-30G] 선택 학생의 가족 맥락 — 형제 상담 접수 시 기존 가족·상담 이력을 조인으로 즉시 노출
  const familyQuery = useStudentFamily(f.studentId);
  const familyMembers = familyQuery.data?.members ?? [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    const counsel = {
      referenceNotes: f.referenceNotes.trim() || undefined,
      nextContactAt: f.nextContactAt ?? undefined,
    };
    if (mode === 'new') {
      if (!draft.validate() || createIntake.isPending) return;
      createIntake.mutate({ registration: draft.input(), counsel }, {
        onSuccess: () => {
          draft.reset();
          setF(empty);
          onSubmitted?.();
        },
        onError: (error) => {
          const parsed = serverStudentErrors(error);
          draft.setErrors((current) => ({ ...current, ...parsed.fields }));
          setMessage(parsed.message);
        },
      });
      return;
    }
    if (f.studentId == null) return;
    createCounsel.mutate({
      studentId: f.studentId,
      ...counsel,
    }, {
      onSuccess: () => {
        setF(empty);
        onSubmitted?.(); // [IA 3분할] 폼 페이지에서 제출 후 목록으로 이동
      },
    });
  };

  return (
    <form onSubmit={submit} className="space-y-8">
      {/* 종이 서식처럼 섹션으로 나눠 여백을 넉넉히 — 입력 항목이 많아도 한눈에 */}
      <Section title="신청자 정보">
        <div className="sm:col-span-2 lg:col-span-3">
          <div className="flex w-fit overflow-hidden rounded-md border border-line" role="group" aria-label="상담 신청 학생 유형">
            <button type="button" className={`btn btn-sm rounded-none border-0 ${mode === 'existing' ? 'badge-accent' : ''}`} onClick={() => setMode('existing')}>기존 학생</button>
            <button type="button" className={`btn btn-sm rounded-none border-0 ${mode === 'new' ? 'badge-accent' : ''}`} onClick={() => setMode('new')}>신규 학생 등록</button>
          </div>
        </div>
        {mode === 'existing' && (
          <>
            <div className="sm:col-span-2 lg:col-span-3"><StudentSearchSelect students={students} value={f.studentId} onChange={(studentId) => set({ studentId })} required /></div>
            {selectedStudent && <><Field label="학생 이름 (원부)"><input className="input" readOnly value={selectedStudent.name} /></Field><Field label="학생 본인 연락처 (원부)"><input className="input" readOnly value={selectedStudent.phone ?? ''} /></Field><Field label="Kakao ID (원부)"><input className="input" readOnly value={selectedStudent.kakaoId ?? ''} /></Field></>}
          </>
        )}
        {/* [TBO-30G] 가족 맥락(조인 파생) — 형제·자매 상담 접수 시 기존 가족·상담 이력을 재입력 없이 확인 */}
        {selectedStudent && familyMembers.length > 0 && (
          <div className="sm:col-span-2 lg:col-span-3 rounded-lg p-3 bg-canvas-subtle text-body space-y-1">
            <div className="text-caption text-fg-subtle">
              가족 {familyMembers.length}명 · 가족 상담 이력 {familyCounselCount(familyMembers)}건 — 학생 원부와 조인된 정보입니다
            </div>
            {familyMembers.map((member) => (
              <div key={member.relationId} className="flex items-center gap-2 flex-wrap">
                <Link href={internalRoute.student(member.student.id)} className="font-medium text-accent hover:underline">{member.student.name}</Link>
                <span className="text-caption text-fg-muted">{familyRelationLabel(member)}{familyMemberSub(member) ? ` · ${familyMemberSub(member)}` : ''}</span>
                {member.counselForms.slice(0, 3).map((counsel) => (
                  <Link key={counsel.id} href={internalRoute.counsel(counsel.id)} className="text-caption text-accent hover:underline">상담 #{counsel.id}</Link>
                ))}
              </div>
            ))}
          </div>
        )}
      </Section>

      {mode === 'new' && (
        <div className="space-y-6 border-t border-line-muted pt-6">
          <StudentRegistrationFields draft={draft} courses={courses} showStatus={false} />
        </div>
      )}

      <Section title="예약 · 상담">
        <div className="sm:col-span-2">
          <CounselNextContactField value={f.nextContactAt} onChange={(nextContactAt) => set({ nextContactAt })} />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <CounselContentField value={f.referenceNotes} onChange={(referenceNotes) => set({ referenceNotes })} />
        </div>
      </Section>

      <div className="flex justify-end pt-2 border-t border-line-muted">
        {message && <p className="mr-auto text-caption text-danger" role="alert">{message}</p>}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={createCounsel.isPending || createIntake.isPending || (mode === 'existing' && f.studentId == null)}
        >
          {createCounsel.isPending || createIntake.isPending ? 'DB 검증·접수 중…' : mode === 'new' ? '학생 등록 및 상담 접수' : '상담 신청'}
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
