import { Field } from '@/components/ui';
import type {
  CounselFormSnapshot,
  CounselSource,
  CounselStatus,
  CounselSubmitterType,
  DesiredStartTime,
  LearningAtmosphere,
  StudentIntention,
} from '@/types';
import { sourceLabel, statusLabel, STATUSES } from './labels';

type Option = { id: number; name: string };

export function CounselPageFields({
  value,
  onChange,
  subjects,
  courses,
  readOnly = false,
}: {
  value: CounselFormSnapshot;
  onChange?: (next: CounselFormSnapshot) => void;
  subjects: Option[];
  courses: Option[];
  readOnly?: boolean;
}) {
  const set = (patch: Partial<CounselFormSnapshot>) => onChange?.({ ...value, ...patch });
  const disabled = readOnly || !onChange;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <Field label="신청자 이름"><input className="input" disabled={disabled} value={value.applicantName} onChange={(e) => set({ applicantName: e.target.value })} /></Field>
      <Field label="연락처"><input className="input" disabled={disabled} value={value.applicantPhone ?? ''} onChange={(e) => set({ applicantPhone: e.target.value || null })} /></Field>
      <Field label="작성 주체">
        <select className="input" disabled={disabled} value={value.submitterType} onChange={(e) => set({ submitterType: e.target.value as CounselSubmitterType })}>
          <option value="parent">학부모</option><option value="student">학생</option><option value="staff">직원</option><option value="unknown">미상</option>
        </select>
      </Field>
      <Field label="상담 상태">
        <select className="input" disabled={disabled} value={value.status} onChange={(e) => set({ status: e.target.value as CounselStatus })}>
          {STATUSES.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}
        </select>
      </Field>
      <Field label="유입 경로">
        <select className="input" disabled={disabled} value={value.source} onChange={(e) => set({ source: e.target.value as CounselSource })}>
          {(Object.keys(sourceLabel) as CounselSource[]).map((source) => <option key={source} value={source}>{sourceLabel[source]}</option>)}
        </select>
      </Field>
      <Field label="다음 상담 예약일"><input type="date" className="input" disabled={disabled} value={value.nextContactAt ?? ''} onChange={(e) => set({ nextContactAt: e.target.value || null })} /></Field>
      <Field label="관심 과목">
        <select className="input" disabled={disabled} value={value.interestSubjectId ?? ''} onChange={(e) => set({ interestSubjectId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">선택 안 함</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select>
      </Field>
      <Field label="관심 코스">
        <select className="input" disabled={disabled} value={value.interestCourseId ?? ''} onChange={(e) => set({ interestCourseId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">선택 안 함</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
        </select>
      </Field>
      <Field label="희망 시작 시기">
        <select className="input" disabled={disabled} value={value.desiredStartTime ?? ''} onChange={(e) => set({ desiredStartTime: (e.target.value || null) as DesiredStartTime | null })}>
          <option value="">선택 안 함</option><option value="immediately">즉시</option><option value="within_1_month">1개월 내</option><option value="within_2_3_months">2~3개월</option><option value="undecided">미정</option>
        </select>
      </Field>
      <Field label="학습 분위기">
        <select className="input" disabled={disabled} value={value.learningAtmosphere ?? ''} onChange={(e) => set({ learningAtmosphere: (e.target.value || null) as LearningAtmosphere | null })}>
          <option value="">선택 안 함</option><option value="self_directed">자기주도</option><option value="normal">보통</option><option value="needs_management">관리필요</option>
        </select>
      </Field>
      <Field label="학생 의향">
        <select className="input" disabled={disabled} value={value.studentIntention ?? ''} onChange={(e) => set({ studentIntention: (e.target.value || null) as StudentIntention | null })}>
          <option value="">선택 안 함</option><option value="student_wants">학생 희망</option><option value="parent_only">학부모 주도</option><option value="unknown">미상</option>
        </select>
      </Field>
      <Field label="약점"><input className="input" disabled={disabled} value={value.weakness ?? ''} onChange={(e) => set({ weakness: e.target.value || null })} /></Field>
      <div className="sm:col-span-2 lg:col-span-3">
        <Field label="학원에 바라는 점"><textarea className="input h-20 py-2" disabled={disabled} value={value.academyExpectation ?? ''} onChange={(e) => set({ academyExpectation: e.target.value || null })} /></Field>
      </div>
    </div>
  );
}
