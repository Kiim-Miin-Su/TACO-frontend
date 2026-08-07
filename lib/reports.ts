// ─────────────────────────────────────────────────────────────
// 리포트 도메인 공용 유틸(잔존분만).
//
// ▣ [SSOT 감사 2026-08-07] "리포트 미작성" 모집단의 단일 진실원은 **서버 worklist**
//   (GET /reports/worklist — 86G2 역할 스코프 서버 판정)다. 종전 클라 재계산 기준 함수
//   missingReportStudentIds와 파생 5종(sessionNeedsReport·pendingReportSessions·
//   pendingReportCount·pendingReportItemCount·pendingReportSummary)은 소비처 0으로 사문화되어
//   삭제했다 — 클라에서 미작성 개수를 다시 계산하는 코드를 이 파일에 되살리지 말 것.
//   남은 것: ReportSlice(집계 slice 타입) · rosterStudentIds(contracts 참여자 규칙 래퍼) ·
//   sessionEndMs(종료 시각 파생 — lib/makeup 공유).
// ─────────────────────────────────────────────────────────────
import type { ClassSession, Enrollment, SessionReport } from "@/types";
import { resolveSessionParticipantIds } from "@kms545487/contracts";

export type ReportSlice = {
  classSessions: ClassSession[];
  enrollments: Enrollment[];
  sessionReports: SessionReport[];
};

// 코스 로스터(리포트 대상 수강생) — **활성 수강만**(enrollment.status==='active').
//  백엔드 스케줄 코호트(activeStudentIds)와 동일 규칙(감사 B): 취소/일시정지/완료 수강생은
//  리포트 미작성 집계에서 제외(소프트삭제된 학생은 enrollment도 canceled로 정리됨 — students.remove).
//  export: ReportWriteView/ReportsCalendarView가 자체 rosterOf 중복 대신 이 함수를 쓴다(단일 소스).
export function rosterStudentIds(
  s: Pick<ReportSlice, 'enrollments'>,
  session: Pick<ClassSession, 'courseId' | 'studentIds'>,
): number[] {
  const activeEnrollmentStudentIds = s.enrollments
    .filter((e) => e.courseId === session.courseId && e.status === 'active')
    .map((e) => e.studentId);
  return resolveSessionParticipantIds(session.studentIds, activeEnrollmentStudentIds);
}

// 세션 종료 시각(ms). endTime 없으면 startTime + durationMinutes로 계산. (로컬 시각 기준)
// export: 보강 판정(lib/makeup)도 "실제 종료 여부"를 같은 규칙으로 공유.
export function sessionEndMs(session: ClassSession): number {
  if (!session.startTime) return Number.POSITIVE_INFINITY; // 시작 시각 없으면 종료 판정 보류(미포함)
  let endHHMM = session.endTime;
  if (!endHHMM) {
    const [h, m] = session.startTime.split(":").map(Number);
    const total = h * 60 + m + (session.durationMinutes ?? 0);
    endHHMM = `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }
  const t = Date.parse(`${session.sessionDate}T${endHHMM}:00`);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

