"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { currentClaims } from "@/lib/auth";
import { isPublicRoute } from "@/lib/auth-routes";
import { useTacoStore } from "@/lib/store";
import { api, type SessionReport as ApiReport } from "@/lib/api";
import { logger } from "@/lib/log";
import type { AccountRole, SessionReport } from "@/types";

const hydrateLog = logger("hydrate");

// 백엔드 보고서(승인 라이프사이클: draft|submitted|approved|rejected)를 store 모델로 정규화.
// 배지 계산은 'draft=미작성', 승인 대기는 approvalStatus로 판단하므로 실제 상태를 approvalStatus에 보존한다.
//  - approved → 'sent'(작성 완료로 집계)  · rejected → 'draft'(재작성 필요 = 미작성으로 집계)
function toStoreReport(r: ApiReport): SessionReport {
  const status: SessionReport["status"] =
    r.status === "approved" ? "sent" : r.status === "rejected" ? "draft" : r.status;
  return {
    id: r.id, sessionId: r.sessionId, studentId: r.studentId, instructorId: r.instructorId,
    subjectId: r.subjectId, content: r.content, homework: r.homework,
    status, approvalStatus: r.status,
    submittedAt: r.submittedAt, approvedAt: r.approvedAt, approvedBy: r.approvedBy,
    rejectedReason: r.rejectedReason,
  };
}

// 공개(인증) 경로는 앱 크롬(사이드바/탑바) 없이 전체화면. 그 외에는 크롬 + 토큰→역할 동기화 + 백엔드 적재.
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const setCurrentRole = useTacoStore((s) => s.setCurrentRole);
  const setInstructorPayouts = useTacoStore((s) => s.setInstructorPayouts);
  const setClassSessions = useTacoStore((s) => s.setClassSessions);
  const setSessionReports = useTacoStore((s) => s.setSessionReports);
  const publicRoute = isPublicRoute(pathname);

  // 로그인된 경우에만 역할을 앱 전역 currentRole에 반영(공개 경로에선 동기화하지 않음).
  useEffect(() => {
    if (publicRoute) return;
    const claims = currentClaims();
    const role = claims?.roles?.[0];
    if (role) setCurrentRole(role as AccountRole);
  }, [pathname, publicRoute, setCurrentRole]);

  // 단일 소스화: 로그인 상태에서 백엔드(정산서·세션·보고서)를 store로 적재 → 배지/대시보드/리포트가 실제와 일치.
  // 실패(오프라인)면 기존 시드 유지.
  useEffect(() => {
    if (publicRoute) return;
    api.payouts.list()
      .then((rows) => { setInstructorPayouts(rows); hydrateLog.info(`payouts ${rows.length}건 적재`); })
      .catch((e) => hydrateLog.warn("payouts 적재 실패(오프라인?) — 시드 유지", e));
    // 전체 세션(기간 필터 없이) → 캘린더(백엔드)에서 추가·held 처리한 세션이 배지/리포트에 반영됨.
    api.schedule.list({})
      .then((rows) => { setClassSessions(rows); hydrateLog.info(`sessions ${rows.length}건 적재`); })
      .catch((e) => hydrateLog.warn("sessions 적재 실패(오프라인?) — 시드 유지", e));
    // 전체 보고서 → 리포트 미작성 배지·승인 대기가 백엔드 기준으로 계산됨.
    api.reports.list()
      .then((rows) => { setSessionReports(rows.map(toStoreReport)); hydrateLog.info(`reports ${rows.length}건 적재`); })
      .catch((e) => hydrateLog.warn("reports 적재 실패(오프라인?) — 시드 유지", e));
  }, [publicRoute, setInstructorPayouts, setClassSessions, setSessionReports]);

  if (publicRoute) return <>{children}</>;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
