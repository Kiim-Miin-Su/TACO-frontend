'use client';

import { Field } from '@/components/ui';
import type { Course } from '@/types';
import { GuardianFields } from './GuardianFields';
import { StudentInterestsFields } from './StudentInterestsFields';
import { StudentProfileFields } from './StudentProfileFields';
import type { useStudentRegistrationDraft } from './useStudentRegistrationDraft';

type StudentRegistrationDraft = ReturnType<typeof useStudentRegistrationDraft>;

export function StudentRegistrationFields({
  draft,
  courses,
  showStatus = true,
}: {
  draft: StudentRegistrationDraft;
  courses: Course[];
  showStatus?: boolean;
}) {
  return (
    <>
      <FormGroup title="학생 정보">
        <StudentProfileFields
          value={draft.profile}
          onChange={(patch) => draft.setProfile((current) => ({ ...current, ...patch }))}
          errors={draft.errors}
          showStatus={showStatus}
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
