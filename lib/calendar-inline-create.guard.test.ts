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

  // [TBO-86I-3] 운영 리포트: ① 기본 전원 체크 불필요 — 기본은 아무도 선택 안 됨 ② 카운트 분모가
  //  수강 roster라 (1/1)→(x/2)→(x/4)처럼 움직임 — 분모는 보이는 재원생 전체 ③ 원부 삭제 학생이
  //  선택에 유령으로 남음 — 파생 prune ④ 직렬화는 단일 규칙. (수정 전 이 단언들은 실패한다.)
  it('학생 선택 기본은 미체크·분모는 재원생 전체·유령 선택은 파생 정리·직렬화 단일 규칙', () => {
    expect(scheduleModal).not.toContain('기본 전원');
    expect(scheduleModal).toContain('pruneStudentSelection');
    expect(scheduleModal).toContain('explicitCohortForSubmit');
    expect(scheduleModal).toContain('studentPickerItems.length}명');
  });

  // [TBO-86I-3] 실측: <label> 래핑 필드는 헤더 텍스트 클릭이 첫 labelable 자식으로 전달돼
  //  "수강생 전체" 버튼이 오발동했고(기본 미체크에서 3명이 몰래 선택됨), 내부 체크리스트
  //  <label>과 중첩 label 무효 마크업이었다. 인라인 생성 필드는 div 렌더를 강제한다.
  it('다중 컨트롤 인라인 필드는 label 클릭 전달을 막는 div 렌더를 쓴다', () => {
    expect(read('components/InlineCreateField.tsx')).toContain('<Field label={label} asDiv>');
    expect(read('components/ui/Field.tsx')).toContain("asDiv ? 'div' : 'label'");
  });

  // [TBO-86I-4] 운영 리포트: 인라인 학생 등록이 compact 분기로 관심 수업·보호자·상태를 숨겼고
  //  "기존에 다니는 가족" 연결 input은 등록 폼 어디에도 없었다(input≠DTO). 인라인·표준·상담 접수는
  //  같은 필드 전체를 쓰고, 가족 연결은 등록 command와 같은 tx로 전송된다(수정 전 이 단언은 실패한다).
  it('학생 등록 폼은 화면과 무관하게 같은 input 전체 — 가족 연결 포함, compact 필드 분기 금지', () => {
    const form = read('features/students/StudentRegistrationForm.tsx');
    const fields = read('features/students/StudentRegistrationFields.tsx');
    expect(form).not.toContain('showOptionalSections');
    expect(form).not.toContain('showStatus');
    expect(fields).toContain('기존에 다니는 가족');
    expect(fields).toContain('familyRelations');
    expect(read('features/students/student-form-model.ts')).toContain('familyRelationInputsOf');
    expect(read('features/counsel/CounselForm.tsx')).not.toContain('showStatus={false}');
  });

  // [TBO-86I-2] 리포트 작성 표면은 BE write command와 같은 report.write capability 판정을 쓴다.
  it('리포트 작성 게이트는 report.write 단일 capability를 소비한다', () => {
    const write = read('features/reports/ReportWriteView.tsx');
    expect(write).toContain("access.can('report.write')");
    expect(write).not.toContain("access.can('instructor.self') && !access.can('approval.manage')");
    expect(read('features/calendar/SessionDetailPanel.tsx')).toContain('report.write');
    expect(read('features/sessions/ClassSessionDetailView.tsx')).toContain('report.write');
    expect(read('features/reports/ReportsCalendarView.tsx')).toContain("access.can('report.write')");
  });

  it('과거 완료 이관은 전용 command를 쓰고 일반 held 주입을 열지 않는다', () => {
    expect(scheduleModal).toContain('historicalCompletedInput');
    expect(scheduleModal).toContain('onCreateHistorical');
    expect(read('lib/api/schedule.ts')).toContain('/schedule/historical-completed');
    expect(read('lib/domain/lantiv.ts')).not.toMatch(/MANUAL_SESSION_STATUSES[^\n]*held/);
  });
});
