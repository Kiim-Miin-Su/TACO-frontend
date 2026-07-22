import { describe, expect, it } from 'vitest';
import type { InstructorAggregate, ScheduleRow, Subject } from '@/types';
import {
  buildOpenClassInput,
  buildOpenClassSeriesInput,
  classOpeningOccurrences,
  recentSubjectSuggestions,
  validateClassOpening,
  type ClassOpeningDraft,
} from './class-opening';

const draft = (patch: Partial<ClassOpeningDraft> = {}): ClassOpeningDraft => ({
  subjectName: ' Writing ',
  instructorId: 7,
  studentIds: [11, 12],
  hourlyRateOverride: '45000',
  coursePrice: '320000',
  isKinder: false,
  color: '#0969da',
  roomId: 3,
  date: '2026-07-27',
  startTime: '16:00',
  endTime: '17:30',
  topic: ' Vocab #6 ',
  memo: ' 교재 지참 ',
  mode: 'in_person',
  ...patch,
});

describe('subject-first class opening', () => {
  it('단건 command에 과목·강사 pay override·학생·운영 입력을 함께 보낸다', () => {
    expect(buildOpenClassInput(draft())).toEqual({
      subjectName: 'Writing',
      instructorId: 7,
      studentIds: [11, 12],
      hourlyRateOverride: 45000,
      coursePrice: 320000,
      isKinder: false,
      color: '#0969da',
      roomId: 3,
      sessionDate: '2026-07-27',
      startTime: '16:00',
      endTime: '17:30',
      durationMinutes: 90,
      topic: 'Vocab #6',
      memo: '교재 지참',
      status: 'scheduled',
      kind: 'class',
      mode: 'in_person',
      isPublic: false,
    });
  });

  it('빈 override는 강사 기본 시급을 쓰도록 null, 빈 옵션은 undefined로 정규화한다', () => {
    const input = buildOpenClassInput(draft({ hourlyRateOverride: '', coursePrice: '', roomId: null, topic: '', memo: '' }));
    expect(input.hourlyRateOverride).toBeNull();
    expect(input.coursePrice).toBeUndefined();
    expect(input.roomId).toBeUndefined();
    expect(input.topic).toBeUndefined();
    expect(input.memo).toBeUndefined();
  });

  it('반복 command는 중복 요일을 정렬하고 KST bulk 규칙으로 보낸다', () => {
    const input = buildOpenClassSeriesInput(draft(), { kind: 'custom', weekdays: [5, 1, 5], endsOn: '2026-08-31' });
    expect(input.repeat).toEqual({ kind: 'custom', weekdays: [1, 5], startsOn: '2026-07-27', endsOn: '2026-08-31' });
    expect(input.timeZone).toBe('Asia/Seoul');
    expect(input.roomId).toBe(3);
  });

  it('최근 제안은 DB 수업 사용순 우선·대소문자 중복 제거 후 DB 카탈로그로 보충한다', () => {
    const rows = [
      { id: 1, sessionDate: '2026-07-20', startTime: '09:00', subjectName: 'Math' },
      { id: 2, sessionDate: '2026-07-21', startTime: '09:00', subjectName: 'Writing' },
      { id: 3, sessionDate: '2026-07-19', startTime: '09:00', subjectName: 'writing' },
    ] as ScheduleRow[];
    const subjects = [
      { id: 10, code: 'science', name: 'Science' },
      { id: 9, code: 'writing', name: 'Writing' },
    ] as Subject[];
    expect(recentSubjectSuggestions(rows, subjects)).toEqual(['Writing', 'Math', 'Science']);
  });

  it('반복 날짜는 선택 요일만 계산하고 종료일 역전은 빈 배열이다', () => {
    expect(classOpeningOccurrences('2026-07-27', '2026-08-09', [1, 3])).toEqual([
      '2026-07-27', '2026-07-29', '2026-08-03', '2026-08-05',
    ]);
    expect(classOpeningOccurrences('2026-08-09', '2026-07-27', [1])).toEqual([]);
  });

  it('Kinder 불가 강사와 시간·금액 경계를 저장 전에 차단한다', () => {
    const instructor = { defaultHourlyRate: 40000, canTeachKinder: false } as InstructorAggregate;
    expect(validateClassOpening(draft({ isKinder: true }), instructor)).toContain('Kinder');
    expect(validateClassOpening(draft({ startTime: '09:00', endTime: '09:00' }), instructor)).toContain('시작과 종료');
    expect(validateClassOpening(draft({ hourlyRateOverride: '-1' }), instructor)).toContain('시급');
    expect(validateClassOpening(draft({ hourlyRateOverride: '' }), { ...instructor, defaultHourlyRate: 0 })).toContain('1원');
  });
});
