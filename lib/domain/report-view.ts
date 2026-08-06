import type { SessionReport as ApiReport } from '@/lib/api';
import type { SessionReport, SessionReportContext } from '@/types';

export type JoinedSessionReport = SessionReport & {
  context: SessionReportContext;
  createdAt: string;
  updatedAt: string;
};

/** API 작성/승인 상태를 화면 상태로 정규화하되 서버 조인 context는 그대로 보존한다. */
export function toStoreReport(report: ApiReport): JoinedSessionReport {
  const approvalStatus = report.approvalStatus ?? (report.status === 'sent' ? 'approved' : report.status);
  return {
    id: report.id,
    sessionId: report.sessionId,
    studentId: report.studentId,
    instructorId: report.instructorId,
    subjectId: report.subjectId,
    content: report.content,
    progressPage: report.progressPage,
    homework: report.homework,
    // 작성/발송 상태와 승인 상태는 서로 다른 수명주기다. 승인됐다는 이유로 발송됨으로 바꾸지 않는다.
    status: report.status,
    approvalStatus,
    submittedAt: report.submittedAt,
    approvedAt: report.approvedAt,
    approvedBy: report.approvedBy,
    rejectedReason: report.rejectedReason,
    context: report.context,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}
