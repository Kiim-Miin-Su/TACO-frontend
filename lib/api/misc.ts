// 리포트 템플릿·감사 이력 API — lib/api.ts에서 분할(순수 이동).
import { http } from "./client";
import type {
  ReportTemplate,
  CreateReportTemplateInput,
  UpdateReportTemplateInput,
  AuditLog,
} from "@kms545487/contracts";

export const miscApi = {
  // [TBO-70] health 클라이언트 삭제 — FE 호출자 0(TBO-69 발견). 서버 /api/health 라우트는 모니터링용으로 유지.
  // 리포트 템플릿(자산화) — zustand → DB 컬렉션.
  reportTemplates: {
    list: () => http.get<ReportTemplate[]>("/report-templates").then((r) => r.data),
    effective: (instructorId?: number | null) =>
      http.get<ReportTemplate | null>("/report-templates/effective", {
        params: instructorId == null ? undefined : { instructorId },
      }).then((r) => r.data),
    create: (input: CreateReportTemplateInput) =>
      http.post<ReportTemplate>("/report-templates", input).then((r) => r.data),
    update: (id: number, input: UpdateReportTemplateInput) =>
      http.patch<ReportTemplate>(`/report-templates/${id}`, input).then((r) => r.data),
    remove: (id: number) => http.delete<ReportTemplate>(`/report-templates/${id}`).then((r) => r.data),
  },
  // [R-6] 변경 이력(audit_log) — ADMIN. entity/entityId로 개별 세션 등의 이력 조회(최신순).
  audit: {
    list: (entity: string, entityId: number, limit?: number) =>
      http.get<AuditLog[]>("/audit", { params: { entity, entityId, limit } }).then((r) => r.data),
  },
};
