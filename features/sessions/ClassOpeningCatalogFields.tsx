'use client';

import { useMemo } from 'react';
import type { InstructorAggregate, Student } from '@/types';
import { Combobox, Field, SearchableCheckList } from '@/components/ui';
import { CoursePayFields, type CoursePayForm } from '@/features/admin/courses/CoursePayFields';
import { studentGradeLabel, STUDENT_STATUS_LABEL } from '@/lib/domain/students';

type ClassOpeningCatalogFieldsProps = {
  subjectName: string;
  subjectSuggestions: string[];
  instructorId: number | null;
  instructors: InstructorAggregate[];
  students: Student[];
  selectedStudentIds: Set<number>;
  pay: CoursePayForm;
  coursePrice: string;
  onSubjectNameChange: (value: string) => void;
  onInstructorChange: (id: number | null) => void;
  onStudentToggle: (id: number) => void;
  onPayChange: (value: CoursePayForm) => void;
  onCoursePriceChange: (value: string) => void;
};

/** 과목·강사·학생·페이로 구성되는 instructor-specific course 입력 묶음. */
export function ClassOpeningCatalogFields({
  subjectName,
  subjectSuggestions,
  instructorId,
  instructors,
  students,
  selectedStudentIds,
  pay,
  coursePrice,
  onSubjectNameChange,
  onInstructorChange,
  onStudentToggle,
  onPayChange,
  onCoursePriceChange,
}: ClassOpeningCatalogFieldsProps) {
  const instructor = instructors.find((item) => item.id === instructorId);
  const studentItems = useMemo(() => students.map((student) => ({
    id: student.id,
    name: student.name,
    description: `${studentGradeLabel(student.grade)} · ${STUDENT_STATUS_LABEL[student.status]}`,
  })), [students]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="과목 *">
          <Combobox
            value={subjectName}
            onChange={onSubjectNameChange}
            suggestions={subjectSuggestions}
            suggestionLabel="DB 최근 사용 과목"
            createLabel="과목으로 추가"
            placeholder="예: Writing, AP Calculus"
            inputName="subjectName"
            required
            autoFocus
          />
          <span className="block text-micro text-fg-subtle mt-1">
            목록에 없어도 직접 입력할 수 있으며, 저장 시 과목과 강사별 수업이 함께 생성됩니다.
          </span>
        </Field>
        <Field label="담당 강사 *">
          <select
            className="input"
            value={instructorId ?? ''}
            onChange={(event) => onInstructorChange(event.target.value ? Number(event.target.value) : null)}
            required
          >
            <option value="">선택</option>
            {instructors.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </Field>
        <CoursePayFields value={pay} instructor={instructor} onChange={onPayChange} />
        <Field label="수업 정가 (원)">
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={0}
            max={100000000}
            step={1000}
            value={coursePrice}
            onChange={(event) => onCoursePriceChange(event.target.value)}
            placeholder="신규 과목은 비우면 0원"
          />
          <span className="block text-micro text-fg-subtle mt-1">강사 페이와 별개인 학생 수강 정가입니다.</span>
        </Field>
      </div>

      <Field label={`연결 학생 (${selectedStudentIds.size}명)`}>
        <SearchableCheckList
          items={studentItems}
          selected={selectedStudentIds}
          onToggle={onStudentToggle}
          placeholder="학생 이름·학년·상태 검색"
          emptyMessage="연결 가능한 학생이 없습니다. 학생 탭에서 먼저 등록하세요."
        />
        <span className="block text-micro text-fg-subtle mt-1">
          선택 학생은 이 수업의 활성 수강 등록과 첫 수업 코호트에 동시에 연결됩니다.
        </span>
      </Field>
    </div>
  );
}
