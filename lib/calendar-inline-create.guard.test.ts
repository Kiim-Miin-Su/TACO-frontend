import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(resolve(__dirname, '..', relativePath), 'utf8');

describe('[TBO-86 C] 캘린더 인라인 등록 공용 컴포넌트', () => {
  const scheduleModal = read('features/calendar/ScheduleCreateModal.tsx');

  it('관리자 카탈로그와 캘린더가 같은 과목·코스 생성 폼을 소비한다', () => {
    const adminCatalog = read('features/admin/CoursesView.tsx');
    for (const component of ['CourseCreateForm', 'SubjectCreateForm']) {
      expect(scheduleModal).toContain(`<${component}`);
      expect(adminCatalog).toContain(`<${component}`);
    }
    expect(adminCatalog).not.toMatch(/function (CourseForm|SubjectForm)\(/);
  });

  it('강사·강의실·학생은 각 도메인의 공용 생성 폼을 조립한다', () => {
    for (const component of ['InstructorCreateForm', 'RoomCreateForm', 'StudentRegistrationForm']) {
      expect(scheduleModal).toContain(`<${component}`);
    }
    expect(read('features/admin/instructors/CreateInstructorModal.tsx')).toContain('<InstructorCreateForm');
    expect(read('features/rooms/RoomManagerPanel.tsx')).toContain('<RoomCreateForm');
    expect(read('features/students/StudentForm.tsx')).toContain('<StudentRegistrationForm');
    expect(read('features/admin/instructors/InstructorCreateForm.tsx')).toContain('useSudoAction');
  });

  it('캘린더 모달은 전체 강의실 관리 화면을 중첩하지 않는다', () => {
    expect(scheduleModal).not.toContain('RoomManagerPanel');
    expect(scheduleModal).toContain('<InlineCreateField');
    expect(scheduleModal).toContain('access.can("executive.manage")');
  });

  // [TBO-86I Grace ver.2 2.2] "스케줄 추가 시 학생이 한 명밖에 안 뜸" — 학생 선택이 코스 roster로
  //  좁혀지고 나머지 재원생은 숨김 확장 패널("+ 재원생 연결") 뒤에 있던 결함. 학생 선택은 재원생
  //  전체 단일 검색 리스트여야 하고(수정 전 이 단언은 실패한다), 숨김 연결 패널을 되살리지 않는다.
  it('학생 선택은 재원생 전체 단일 리스트를 소비하고 숨김 연결 패널을 두지 않는다', () => {
    expect(scheduleModal).toContain('studentPickerItemsFromScheduleResources');
    expect(scheduleModal).not.toContain('showStudentLinker');
    expect(scheduleModal).not.toContain('재원생 연결');
  });

  it('과거 완료 이관은 전용 command를 쓰고 일반 held 주입을 열지 않는다', () => {
    expect(scheduleModal).toContain('historicalCompletedInput');
    expect(scheduleModal).toContain('onCreateHistorical');
    expect(read('lib/api/schedule.ts')).toContain('/schedule/historical-completed');
    expect(read('lib/domain/lantiv.ts')).not.toMatch(/MANUAL_SESSION_STATUSES[^\n]*held/);
  });
});
