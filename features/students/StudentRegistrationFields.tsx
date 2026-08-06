'use client';

import { Field } from '@/components/ui';
import type { Course, Student } from '@/types';
import { GuardianFields } from './GuardianFields';
import { StudentInterestsFields } from './StudentInterestsFields';
import { StudentProfileFields } from './StudentProfileFields';
import type { useStudentRegistrationDraft } from './useStudentRegistrationDraft';

type StudentRegistrationDraft = ReturnType<typeof useStudentRegistrationDraft>;

// [TBO-86I-4] 인라인(캘린더)과 표준 등록 화면은 **같은 input 전체**를 쓴다 — compact가 관심 수업·
//  보호자·상태를 숨기던 분기(구 showStatus/showOptionalSections)를 폐지했다(input≡DTO 일치 규약).
//  "기존에 다니는 가족" 연결 그룹 신설 — 등록 command와 같은 tx로 저장된다(BE 원자성).
export function StudentRegistrationFields({
  draft,
  courses,
  students,
}: {
  draft: StudentRegistrationDraft;
  courses: Course[];
  students: Student[];
}) {
  return (
    <>
      <FormGroup title="학생 정보">
        <StudentProfileFields
          value={draft.profile}
          onChange={(patch) => draft.setProfile((current) => ({ ...current, ...patch }))}
          errors={draft.errors}
        />
      </FormGroup>

      <FormGroup title="관심 희망 수업 (선택 · 실제 수강 등록과 별도)">
        <StudentInterestsFields
          value={draft.interests}
          courses={courses}
          onChange={draft.setInterests}
          error={draft.errors.interests}
        />
      </FormGroup>

      <FormGroup title="보호자 (선택 · 학생과 함께 원자 저장)">
        <div className="space-y-3">
          {draft.guardians.map((guardian) => (
            <GuardianFields
              key={guardian.clientId}
              value={guardian}
              onChange={(patch) => draft.updateGuardian(guardian.clientId, patch)}
              onRemove={() => draft.setGuardians((current) => current.filter((item) => item.clientId !== guardian.clientId))}
            />
          ))}
          <button type="button" className="btn btn-sm" onClick={draft.addGuardian} disabled={draft.guardians.length >= 10}>+ 보호자 추가</button>
          {draft.errors.guardians && <p className="text-caption text-danger" role="alert">{draft.errors.guardians}</p>}
        </div>
      </FormGroup>

      <FormGroup title="기존에 다니는 가족 (선택 · 관계·보호자 연결까지 같은 저장)">
        <div className="space-y-3">
          {draft.familyRelations.map((relation) => (
            <div key={relation.clientId} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end border border-line-muted rounded-lg p-3">
              <Field label="기존 재원생 *">
                <select
                  className="input"
                  value={relation.relatedStudentId}
                  onChange={(event) => draft.updateFamilyRelation(relation.clientId, { relatedStudentId: event.target.value })}
                >
                  <option value="">학생 선택</option>
                  {students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
                </select>
              </Field>
              <Field label="관계">
                <select
                  className="input"
                  value={relation.relationType}
                  onChange={(event) => draft.updateFamilyRelation(relation.clientId, { relationType: event.target.value as 'sibling' | 'other' })}
                >
                  <option value="sibling">형제·자매</option>
                  <option value="other">기타</option>
                </select>
              </Field>
              {relation.relationType === 'other' ? (
                <Field label="관계 이름 *">
                  <input
                    className="input"
                    value={relation.relationLabel}
                    placeholder="예: 사촌"
                    maxLength={50}
                    onChange={(event) => draft.updateFamilyRelation(relation.clientId, { relationLabel: event.target.value })}
                  />
                </Field>
              ) : <div className="hidden lg:block" />}
              <label className="flex items-center gap-1 pb-1 text-caption text-fg-muted">
                <input
                  type="checkbox"
                  checked={relation.linkGuardians}
                  onChange={(event) => draft.updateFamilyRelation(relation.clientId, { linkGuardians: event.target.checked })}
                />
                보호자 함께 연결
              </label>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => draft.removeFamilyRelation(relation.clientId)}>가족 제거</button>
            </div>
          ))}
          <button type="button" className="btn btn-sm" onClick={draft.addFamilyRelation} disabled={draft.familyRelations.length >= 10}>+ 가족 연결</button>
          {draft.errors.familyRelations && <p className="text-caption text-danger" role="alert">{draft.errors.familyRelations}</p>}
        </div>
      </FormGroup>

      <FormGroup title="즉시 수강 등록 (선택 · 희망 수업과 별도)">
        <div className="max-w-md">
          <Field label="실제 수강 코스">
            <select className="input" value={draft.courseId} onChange={(event) => draft.setCourseId(event.target.value)}>
              <option value="">등록하지 않음</option>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
            </select>
          </Field>
        </div>
      </FormGroup>
    </>
  );
}

export function FormGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="text-caption font-semibold text-fg-muted mb-2">{title}</h3>{children}</section>;
}
