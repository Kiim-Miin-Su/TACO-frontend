// [TBO-87] 강사|직원(매니저+) 탭 분리 + 겸직(역할 단일 + 활성 강사원부 합성) FE 계약.
//  대표 확정 3결정: ① 겸직 = users.role 유지 + roles=['role','instructor'] 합성(합성은 축소가 아니다)
//  ② 출석부 탭 자체 분리 — 강사(가르치는 사람, 겸직 포함) | 직원 근태(매니저+), 겸직자 양쪽 노출
//  ③ 겸직 매니저 수업은 강사와 동일하게 시수·정산 포함.
//  이 테스트는 "instructor.self=순수 강사" 동치가 깨진 뒤(겸직 도입) 제한 모드가 겸직 매니저를
//  축소시키지 않도록 소스 계약을 고정한다. 수정 전(제한이 instructor.self 단독 판정)이라면 실패한다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROLE_CAPABILITIES, roleHasCapability, type RoleCapability } from '@kms545487/contracts';
import { instructorIdFor } from '@/lib/access-control';

const read = (relativePath: string) => readFileSync(resolve(__dirname, '..', relativePath), 'utf8');
// BE effective-capabilities.ts와 동형의 roles 합집합(순수 — override 없음 경로).
const capsOf = (roles: string[]): RoleCapability[] =>
  ROLE_CAPABILITIES.filter((capability) => roles.some((role) => roleHasCapability(role, capability)));

describe('[TBO-87] 강사|직원 탭 분리 + 겸직 합성 FE 계약', () => {
  it('출석부는 직원 근태 탭을 매니저에게만 노출하고 전용 뷰(StaffDayAttendanceView)로 분기한다', () => {
    const book = read('features/attendance/AttendanceBookView.tsx');
    expect(book).toContain('"직원 근태"');
    expect(book).toContain('tab === "staff" && manager');
    expect(book).toContain('<StaffDayAttendanceView />');
    // 직원 근태 탭은 자체 기간 컨트롤 — 상단 ym 네비는 staff 탭에서 숨긴다.
    expect(book).toContain('tab !== "staff" &&');
  });

  it('직원 근태 모집단 = 활성 매니저 이상, 상태 톤·기록 모달은 공용 재사용(로컬 사본 금지)', () => {
    const staff = read('features/attendance/StaffDayAttendanceView.tsx');
    expect(staff).toContain('user.role === "manager" || user.role === "admin" || user.role === "super_admin"');
    expect(staff).toContain('staffAttendanceStatusTone');
    expect(staff).toContain('<StaffAttendanceRecordModal');
    expect(staff).not.toMatch(/const statusTone\s*=/);
    // 강사 탭 원장(StaffAttendanceLedgerView)도 같은 톤 헬퍼를 소비 — 승격된 단일 소스.
    const ledger = read('features/attendance/StaffAttendanceLedgerView.tsx');
    expect(ledger).toContain('staffAttendanceStatusTone');
    expect(ledger).not.toMatch(/const statusTone\s*=/);
    expect(read('lib/domain/staff-attendance.ts')).toContain('export const staffAttendanceStatusTone');
  });

  it('겸직 매니저 무축소 — 제한 모드는 순수 강사(관리 capability 없음)에만 적용된다', () => {
    const calendar = read('features/calendar/ScheduleCalendar.tsx');
    // 캘린더 제한 모드 판정 = instructor.self ∧ ¬calendar.manage (BE isInstructorOnly 동형).
    expect(calendar).toContain('access.can("instructor.self") && !canManage');
    // 본인 스코프 클라 방어는 제한 모드에서만 — raw myInstructorId로 전체 rows를 좁히지 않는다.
    expect(calendar).toContain('const scopeInstructorId = isInstructor ? myInstructorId : undefined');
    expect(calendar).not.toContain('scopeCalendarRowsToInstructor(scheduleQ.data, myInstructorId)');
    expect(calendar).not.toContain('scopeCalendarRowsToInstructor(rows, myInstructorId)');
    // 대시보드: 겸직 매니저는 운영 대시보드 유지(강사 To-do로 대체 금지).
    expect(read('features/dashboard/DashboardView.tsx')).toContain("access.can('instructor.self') && !admin");
    // 리포트 작성: 본인 강제 스코프는 순수 강사만 — 매니저 대리 작성 표면(강사 필터) 유지.
    expect(read('features/reports/ReportWriteView.tsx')).toContain("access.can('admin.area') ? null : access.instructorId");
    // 출석부: 본인 코스 제한·정정 요청 버튼은 직접 편집 권한이 없는 경우에만.
    const book = read('features/attendance/AttendanceBookView.tsx');
    expect(book).toContain('instructorSelf && !manager');
    expect(book).toContain('instructorSelf && !canEditInstructorAtt');
  });

  it('instructorIdFor — 겸직 매니저(roles 합성)는 본인 id, 일반 매니저는 null, 매니저 권한은 유지된다', () => {
    const dual = capsOf(['manager', 'instructor']);
    expect(dual).toContain('instructor.self'); // 강사 정체성 합성
    expect(dual).toContain('approval.manage'); // 매니저 권한 유지(축소 없음)
    expect(dual).toContain('calendar.manage');
    expect(instructorIdFor({ id: 7, role: 'manager', effectiveCapabilities: dual })).toBe(7);
    expect(instructorIdFor({ id: 7, role: 'manager', effectiveCapabilities: capsOf(['manager']) })).toBeNull();
    expect(instructorIdFor({ id: 3, role: 'instructor', effectiveCapabilities: capsOf(['instructor']) })).toBe(3);
    // effectiveCapabilities가 없는 좁은 객체(하위호환) — role 판정만으로 동작.
    expect(instructorIdFor({ id: 9, role: 'manager' })).toBeNull();
  });
});
