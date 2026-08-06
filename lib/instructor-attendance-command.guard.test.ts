import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('강사 출결 전용 command 배선', () => {
  it('API와 공용 훅이 PUT/DELETE, 회계 ACK, calendar invalidation을 소유한다', () => {
    const api = read('lib/api/schedule.ts');
    const queries = read('lib/queries/schedule.ts');

    expect(api).toContain('setInstructorAttendance:');
    expect(api).toContain('http.put<ScheduleMutationResult');
    expect(api).toContain('clearInstructorAttendance:');
    expect(api).toContain('http.delete<ScheduleMutationResult');
    expect(queries).toContain('useInstructorAttendanceCommand');
    expect(queries).toContain('useAccountingAck(mutation');
    expect(queries).toContain('invalidateCalendarCommand(qc)');
  });

  it('출결을 편집하는 4개 화면은 범용 schedule PATCH payload를 만들지 않는다', () => {
    const files = [
      'features/attendance/AttendanceBookView.tsx',
      'features/attendance/InstructorAttendanceDetailView.tsx',
      'features/sessions/ClassSessionDetailView.tsx',
      'features/payouts/PayoutWorksheet.tsx',
    ];

    for (const file of files) {
      const source = read(file);
      expect(source, file).toContain('useInstructorAttendanceCommand');
      expect(source, file).toContain('session-attendance.manage');
      expect(source, file).not.toMatch(/body:\s*\{\s*instructorAttendance:/);
      expect(source, file).not.toMatch(/body:\s*\{\s*clearInstructorAttendance:/);
    }
  });

  it('강사 정정 요청은 수업·출석부에서 같은 모달/DTO builder를 쓰고 승인 상세가 snapshot을 표시한다', () => {
    const modal = read('features/attendance/InstructorAttendanceCorrectionModal.tsx');
    const sessionDetail = read('features/sessions/ClassSessionDetailView.tsx');
    const attendanceBook = read('features/attendance/AttendanceBookView.tsx');
    const requestDetail = read('features/admin/RequestDetailModal.tsx');

    expect(modal).toContain('buildInstructorAttendanceCorrectionRequestBody');
    expect(modal).toContain('useCreateScheduleRequest');
    expect(modal).not.toContain('setInstructorAttendance');
    expect(sessionDetail).toContain('InstructorAttendanceCorrectionModal');
    expect(attendanceBook).toContain('InstructorAttendanceCorrectionModal');
    expect(requestDetail).toContain("r.requestKind === 'instructor_attendance_correction'");
    expect(requestDetail).toContain('r.instructorAttendanceBefore');
    expect(requestDetail).toContain('r.requestedInstructorAttendance');
  });
});
