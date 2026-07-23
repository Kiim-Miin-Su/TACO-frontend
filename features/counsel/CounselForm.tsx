'use client';
import { useState } from 'react';
import { Field } from '@/components/ui';
// 읽기(subjects·courses)/쓰기(상담 생성·수정)는 TanStack Query 훅 경유(zustand store 대체).
import { useStudents, useCreateCounsel, useStudentFamily } from '@/lib/queries';
import { useAccountAccess } from '@/lib/useAccountAccess';
import type { CounselSource } from '@/types';
import { StudentSearchSelect } from '@/features/students/StudentSearchSelect';
// [TBO-30G] 가족 조인 단일 진실원 — 학생 상세·상담 상세와 같은 훅·같은 파생 헬퍼 소비(사본 정의 금지)
import Link from 'next/link';
import { familyCounselCount, familyMemberSub, familyRelationLabel } from '@/features/students/family-shared';

type Author = 'parent' | 'student' | 'staff';

type FormState = {
  author: Author;
  studentId: number | null;
  referenceNotes: string;
  dateUndecided: boolean; // 다음 상담일 미정 여부
  nextContactAt: string;  // 다음 상담일(미정 아니면)
};

const empty: FormState = {
  author: 'parent', studentId: null,
  referenceNotes: '',
  dateUndecided: true, nextContactAt: '',
};

// 작성 주체 → source 매핑 (학생/학부모 = 내부폼, 상담실장 = 수기접수)
const sourceOf = (a: Author): CounselSource => (a === 'staff' ? 'manual' : 'internal_form');

export function CounselForm({ onSubmitted }: { onSubmitted?: () => void } = {}) {
  const createCounsel = useCreateCounsel();
  const { account } = useAccountAccess();
  const { data: students = [] } = useStudents();
  const [f, setF] = useState<FormState>(empty);
  const set = (p: Partial<FormState>) => setF((prev) => ({ ...prev, ...p }));
  const selectedStudent = f.studentId == null
    ? undefined
    : students.find((student) => student.id === f.studentId);
  // [TBO-30G] 선택 학생의 가족 맥락 — 형제 상담 접수 시 기존 가족·상담 이력을 조인으로 즉시 노출
  const familyQuery = useStudentFamily(f.studentId);
  const familyMembers = familyQuery.data?.members ?? [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (f.studentId == null) return;
    createCounsel.mutate({
      studentId: f.studentId,
      source: sourceOf(f.author),
      submitterType: f.author,
      assignedStaffId: f.author === 'staff' ? account?.id : undefined,
      referenceNotes: f.referenceNotes.trim() || undefined,
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
        <div className="sm:col-span-2 lg:col-span-3"><StudentSearchSelect students={students} value={f.studentId} onChange={(studentId) => set({ studentId })} required /></div>
        {selectedStudent && <><Field label="학생 이름 (원부)"><input className="input" readOnly value={selectedStudent.name} /></Field><Field label="학생 본인 연락처 (원부)"><input className="input" readOnly value={selectedStudent.phone ?? ''} /></Field><Field label="Kakao ID (원부)"><input className="input" readOnly value={selectedStudent.kakaoId ?? ''} /></Field></>}
        {/* [TBO-30G] 가족 맥락(조인 파생) — 형제·자매 상담 접수 시 기존 가족·상담 이력을 재입력 없이 확인 */}
        {selectedStudent && familyMembers.length > 0 && (
          <div className="sm:col-span-2 lg:col-span-3 rounded-lg p-3 bg-canvas-subtle text-body space-y-1">
            <div className="text-caption text-fg-subtle">
              가족 {familyMembers.length}명 · 가족 상담 이력 {familyCounselCount(familyMembers)}건 — 학생 원부와 조인된 정보입니다
            </div>
            {familyMembers.map((member) => (
              <div key={member.relationId} className="flex items-center gap-2 flex-wrap">
                <Link href={`/students/${member.student.id}`} className="font-medium text-accent hover:underline">{member.student.name}</Link>
                <span className="text-caption text-fg-muted">{familyRelationLabel(member)}{familyMemberSub(member) ? ` · ${familyMemberSub(member)}` : ''}</span>
                {member.counselForms.slice(0, 3).map((counsel) => (
                  <Link key={counsel.id} href={`/counsel/${counsel.id}`} className="text-caption text-accent hover:underline">상담 #{counsel.id}</Link>
                ))}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="예약 · 참고">
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
          <Field label="상담 시 참고할 점">
            <textarea className="input h-24 py-2" value={f.referenceNotes} onChange={(e) => set({ referenceNotes: e.target.value })} placeholder="상담 전에 알아야 할 내용을 기록해 주세요" />
          </Field>
        </div>
      </Section>

      <div className="flex justify-end pt-2 border-t border-line-muted">
        <button type="submit" className="btn btn-primary" disabled={createCounsel.isPending || f.studentId == null}>
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
