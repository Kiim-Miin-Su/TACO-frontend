import type { FormIssue } from '@/lib/form-issues';

export type ScheduleFormField =
  | 'course'
  | 'instructor'
  | 'students'
  | 'date'
  | 'time'
  | 'weekdays'
  | 'availabilityOwner'
  | 'importReason';

type ScheduleFormInput = {
  type: 'session' | 'available' | 'unavailable' | 'online_only';
  courseId: number;
  instructorId: number | 'unassigned' | '';
  participantCount: number;
  date: string;
  start: string;
  end: string;
  repeat: 'none' | 'weekly' | 'custom';
  customWeekdays: readonly number[];
  occurrencesCount: number;
  availabilityOwnerId: number | '';
  historicalImport: boolean;
  historicalImportEligible: boolean;
  importReason: string;
};

export function scheduleFormIssues(input: ScheduleFormInput): FormIssue<ScheduleFormField>[] {
  const issues: FormIssue<ScheduleFormField>[] = [];
  const push = (field: ScheduleFormField, code: string, message: string) => issues.push({ field, code, message });

  if (input.type === 'session') {
    if (!input.courseId) push('course', 'required', '과목을 선택해 주세요.');
    if (input.historicalImport && typeof input.instructorId !== 'number') {
      push('instructor', 'required', '완료 수업의 담당 강사를 선택해 주세요.');
    }
    if (input.participantCount < 1) push('students', 'required', '학생을 한 명 이상 선택해 주세요.');
  } else if (input.availabilityOwnerId === '') {
    push('availabilityOwner', 'required', '적용 대상을 선택해 주세요.');
  }

  if (!input.date) push('date', 'required', '날짜를 선택해 주세요.');
  if (!input.start || !input.end) {
    push('time', 'required', '시작과 종료 시각을 선택해 주세요.');
  } else if (input.type === 'session' ? input.start === input.end : input.start >= input.end) {
    push('time', 'invalid_range', input.type === 'session'
      ? '종료 시각은 시작 시각과 같을 수 없습니다.'
      : '종료 시각은 시작 시각보다 늦어야 합니다.');
  }
  if (input.repeat === 'custom' && input.customWeekdays.length === 0) {
    push('weekdays', 'required', '반복할 요일을 한 개 이상 선택해 주세요.');
  } else if (input.repeat !== 'none' && input.occurrencesCount === 0) {
    push('weekdays', 'empty_range', '선택한 기간에 생성할 회차가 없습니다.');
  }
  if (input.type === 'session' && input.historicalImport) {
    if (!input.historicalImportEligible) push('date', 'historical_only', '종료된 과거의 단건 수업만 완료로 저장할 수 있습니다.');
    if (input.importReason.trim().length < 5) push('importReason', 'min_length', '이관 사유를 5자 이상 입력해 주세요.');
  }
  return issues;
}
