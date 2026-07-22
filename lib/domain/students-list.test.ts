import { describe, expect, it } from 'vitest';
import type { Student } from '@/types';
import { studentsForList } from './students';

describe('studentsForList', () => {
  const students = [
    { id: 1, name: '수강', status: 'enrolled' },
    { id: 2, name: '퇴원', status: 'withdrawn' },
    { id: 3, name: '이탈', status: 'registration_lost' },
    { id: 4, name: '휴강', status: 'on_leave' },
  ] as Student[];

  it('기본 목록은 퇴원·등록이탈만 숨긴다', () => {
    expect(studentsForList(students, false).map((student) => student.id)).toEqual([1, 4]);
  });

  it('포함 선택 시 DB가 반환한 퇴원·등록이탈 원부도 모두 표시한다', () => {
    expect(studentsForList(students, true).map((student) => student.id)).toEqual([1, 2, 3, 4]);
  });
});
