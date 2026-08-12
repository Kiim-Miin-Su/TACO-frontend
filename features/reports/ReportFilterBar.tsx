'use client';

import type { Instructor, ReportWorklistQuery, Student, Subject } from '@kms545487/contracts';
import { Field } from '@/components/ui';

type ReportFilterBarProps = {
  filters: ReportWorklistQuery;
  onChange: (filters: ReportWorklistQuery) => void;
  students: readonly Student[];
  subjects: readonly Subject[];
  instructors: readonly Instructor[];
  showInstructor: boolean;
};

const selectedId = (value: string) => value ? Number(value) : undefined;

export function ReportFilterBar({
  filters,
  onChange,
  students,
  subjects,
  instructors,
  showInstructor,
}: ReportFilterBarProps) {
  return (
    <div className="grid grid-cols-2 gap-3 border-y border-line-muted py-3 lg:grid-cols-6">
      <Field label="시작일">
        <input
          type="date"
          className="input w-full"
          value={filters.from ?? ''}
          max={filters.to}
          onChange={(event) => onChange({ ...filters, from: event.target.value || undefined })}
        />
      </Field>
      <Field label="종료일">
        <input
          type="date"
          className="input w-full"
          value={filters.to ?? ''}
          min={filters.from}
          onChange={(event) => onChange({ ...filters, to: event.target.value || undefined })}
        />
      </Field>
      <Field label="학생">
        <select
          className="input w-full"
          value={filters.studentId ?? ''}
          onChange={(event) => onChange({ ...filters, studentId: selectedId(event.target.value) })}
        >
          <option value="">전체 학생</option>
          {students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
        </select>
      </Field>
      <Field label="과목">
        <select
          className="input w-full"
          value={filters.subjectId ?? ''}
          onChange={(event) => onChange({ ...filters, subjectId: selectedId(event.target.value) })}
        >
          <option value="">전체 과목</option>
          {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select>
      </Field>
      {showInstructor && (
        <Field label="강사">
          <select
            className="input w-full"
            value={filters.instructorId ?? ''}
            onChange={(event) => onChange({ ...filters, instructorId: selectedId(event.target.value) })}
          >
            <option value="">전체 강사</option>
            {instructors.map((instructor) => <option key={instructor.id} value={instructor.id}>{instructor.name}</option>)}
          </select>
        </Field>
      )}
      <div className={`flex items-end ${showInstructor ? 'col-span-1' : 'col-span-2 lg:col-span-1'}`}>
        <button type="button" className="btn w-full" onClick={() => onChange({})}>필터 초기화</button>
      </div>
    </div>
  );
}
