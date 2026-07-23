'use client';

import { useMemo, useState } from 'react';
import { apiErrorMessage as sharedApiErrorMessage } from '@/lib/api-error'; // [TBO-34 C3]
import type { AxiosError } from 'axios';
import { useInstructorAdminList, useOpenClass, useOpenClassSeries, useRooms, useSchedule, useStudents, useSubjects } from '@/lib/queries';
import { PALETTE } from '@/lib/domain/lantiv';
import { dateInTimeZone, isActiveStudent } from '@/lib/domain/students';
import { weekdayOf } from '@/lib/domain/schedule';
import {
  buildOpenClassInput,
  buildOpenClassSeriesInput,
  classOpeningOccurrences,
  recentSubjectSuggestions,
  validateClassOpening,
  type ClassOpeningDraft,
} from '@/lib/domain/class-opening';
import type { ScheduleRepeat } from '@/features/calendar/inputs/ScheduleRepeatFields';
import { ClassOpeningCatalogFields } from './ClassOpeningCatalogFields';
import { ClassOpeningScheduleFields } from './ClassOpeningScheduleFields';

const addDays = (iso: string, days: number): string => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const initialDraft = (): ClassOpeningDraft => ({
  subjectName: '',
  instructorId: null,
  studentIds: [],
  hourlyRateOverride: '',
  coursePrice: '',
  isKinder: false,
  color: PALETTE[0],
  roomId: null,
  date: dateInTimeZone(),
  startTime: '09:00',
  endTime: '10:30',
  topic: '',
  memo: '',
  mode: 'in_person',
});


/** 과목 카탈로그부터 수강·스케줄까지 서버의 원자 command 하나로 개설한다. */
export function SessionForm() {
  const { data: subjects = [] } = useSubjects();
  const { data: instructors = [] } = useInstructorAdminList();
  const { data: students = [] } = useStudents();
  const { data: rooms = [] } = useRooms();
  const { data: classSessions = [] } = useSchedule();
  const openClass = useOpenClass();
  const openClassSeries = useOpenClassSeries();

  const [draft, setDraft] = useState<ClassOpeningDraft>(initialDraft);
  const [repeat, setRepeat] = useState<ScheduleRepeat>('none');
  const [untilDate, setUntilDate] = useState(() => addDays(dateInTimeZone(), 28));
  const [customWeekdays, setCustomWeekdays] = useState<number[]>(() => [weekdayOf(dateInTimeZone())]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const activeStudents = useMemo(() => students.filter(isActiveStudent), [students]);
  const selectedStudentIds = useMemo(() => new Set(draft.studentIds), [draft.studentIds]);
  const subjectSuggestions = useMemo(
    () => recentSubjectSuggestions(classSessions, subjects),
    [classSessions, subjects],
  );
  const topicSuggestions = useMemo(
    () => [...new Set(classSessions.map((row) => row.topic?.trim()).filter((value): value is string => Boolean(value)))].slice(0, 10),
    [classSessions],
  );
  const seriesWeekdays = repeat === 'weekly' ? [weekdayOf(draft.date)] : customWeekdays;
  const occurrences = repeat === 'none'
    ? [draft.date]
    : classOpeningOccurrences(draft.date, untilDate, seriesWeekdays);
  const selectedInstructor = instructors.find((instructor) => instructor.id === draft.instructorId);
  const pending = openClass.isPending || openClassSeries.isPending;

  const patchDraft = <K extends keyof ClassOpeningDraft>(key: K, value: ClassOpeningDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const reset = () => {
    const next = initialDraft();
    setDraft(next);
    setRepeat('none');
    setUntilDate(addDays(next.date, 28));
    setCustomWeekdays([weekdayOf(next.date)]);
  };

  const toggleStudent = (id: number) => {
    patchDraft('studentIds', selectedStudentIds.has(id)
      ? draft.studentIds.filter((studentId) => studentId !== id)
      : [...draft.studentIds, id]);
  };

  const toggleWeekday = (weekday: number) => {
    setCustomWeekdays((current) => current.includes(weekday)
      ? current.filter((value) => value !== weekday)
      : [...current, weekday].sort((a, b) => a - b));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');

    const validationError = validateClassOpening(draft, selectedInstructor);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (repeat !== 'none' && untilDate < draft.date) {
      setError('반복 종료일은 첫 수업일 이후여야 합니다.');
      return;
    }
    if (repeat === 'custom' && customWeekdays.length === 0) {
      setError('반복 요일을 1개 이상 선택하세요.');
      return;
    }
    if (repeat !== 'none' && occurrences.length === 0) {
      setError('선택한 기간에 생성할 수업이 없습니다.');
      return;
    }

    const onSuccess = (count: number) => {
      reset();
      setNotice(`${count}개 수업이 DB에 개설되고 관련 목록을 새로고침했습니다.`);
    };

    if (repeat === 'none') {
      openClass.mutate(buildOpenClassInput(draft), {
        onSuccess: () => onSuccess(1),
        onError: (caught) => setError(sharedApiErrorMessage(caught, '수업을 개설하지 못했습니다. 입력값과 기존 스케줄 충돌을 확인하세요.')),
      });
      return;
    }
    openClassSeries.mutate(buildOpenClassSeriesInput(draft, {
      kind: repeat,
      weekdays: seriesWeekdays,
      endsOn: untilDate,
    }), {
      onSuccess: (result) => onSuccess(result.rows.length),
      onError: (caught) => setError(sharedApiErrorMessage(caught, '수업을 개설하지 못했습니다. 입력값과 기존 스케줄 충돌을 확인하세요.')),
    });
  };

  return (
    <form onSubmit={submit} className="p-4 space-y-5">
      <ClassOpeningCatalogFields
        subjectName={draft.subjectName}
        subjectSuggestions={subjectSuggestions}
        instructorId={draft.instructorId}
        instructors={instructors}
        students={activeStudents}
        selectedStudentIds={selectedStudentIds}
        pay={{ hourlyRateOverride: draft.hourlyRateOverride, isKinder: draft.isKinder }}
        coursePrice={draft.coursePrice}
        onSubjectNameChange={(value) => patchDraft('subjectName', value)}
        onInstructorChange={(value) => patchDraft('instructorId', value)}
        onStudentToggle={toggleStudent}
        onPayChange={(value) => setDraft((current) => ({ ...current, ...value }))}
        onCoursePriceChange={(value) => patchDraft('coursePrice', value)}
      />

      <div className="border-t border-line-muted" />

      <ClassOpeningScheduleFields
        rooms={rooms}
        date={draft.date}
        startTime={draft.startTime}
        endTime={draft.endTime}
        roomId={draft.roomId}
        mode={draft.mode}
        color={draft.color}
        topic={draft.topic}
        memo={draft.memo}
        topicSuggestions={topicSuggestions}
        repeat={repeat}
        customWeekdays={customWeekdays}
        untilDate={untilDate}
        occurrencesCount={occurrences.length}
        onDateChange={(value) => patchDraft('date', value)}
        onStartTimeChange={(value) => patchDraft('startTime', value)}
        onEndTimeChange={(value) => patchDraft('endTime', value)}
        onRoomChange={(value) => patchDraft('roomId', value)}
        onModeChange={(value) => patchDraft('mode', value)}
        onColorChange={(value) => patchDraft('color', value)}
        onTopicChange={(value) => patchDraft('topic', value)}
        onMemoChange={(value) => patchDraft('memo', value)}
        onRepeatChange={setRepeat}
        onToggleWeekday={toggleWeekday}
        onUntilDateChange={setUntilDate}
      />

      <div className="flex flex-wrap items-center justify-end gap-3">
        {error && <span className="text-caption text-danger mr-auto" role="alert">{error}</span>}
        {notice && <span className="text-caption text-success mr-auto" role="status">{notice}</span>}
        <span className="text-caption text-fg-subtle">
          {repeat === 'none' ? '단일 수업' : `${occurrences.length}회 반복`} · {draft.studentIds.length}명 연결
        </span>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'DB에 개설 중…' : repeat === 'none' ? '수업 개설' : `반복 수업 ${occurrences.length}회 개설`}
        </button>
      </div>
    </form>
  );
}
