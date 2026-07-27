// 헬스체크·뷰 프리셋·리포트 템플릿·감사 이력 API — lib/api.ts에서 분할(순수 이동).
import { http } from "./client";
import type {
  CalendarViewPreset,
  CreateViewPresetInput,
  ReportTemplate,
  AuditLog,
} from "@kms545487/contracts";

export const miscApi = {
  // [TBO-70] health 클라이언트 삭제 — FE 호출자 0(TBO-69 발견). 서버 /api/health 라우트는 모니터링용으로 유지.
  // 캘린더 뷰 프리셋(TBO-12 P1) — 직원 공용 자산(DB 컬렉션, localStorage 대체).
  viewPresets: {
    list: () => http.get<CalendarViewPreset[]>("/view-presets").then((r) => r.data),
    create: (input: CreateViewPresetInput) => http.post<CalendarViewPreset>("/view-presets", input).then((r) => r.data),
    update: (id: number, input: CreateViewPresetInput) => http.patch<CalendarViewPreset>(`/view-presets/${id}`, input).then((r) => r.data),
    remove: (id: number) => http.delete<CalendarViewPreset>(`/view-presets/${id}`).then((r) => r.data),
  },
  // 리포트 템플릿(자산화) — zustand → DB 컬렉션.
  reportTemplates: {
    list: () => http.get<ReportTemplate[]>("/report-templates").then((r) => r.data),
    create: (input: { name: string; content: string; homework?: string }) =>
      http.post<ReportTemplate>("/report-templates", input).then((r) => r.data),
    remove: (id: number) => http.delete<ReportTemplate>(`/report-templates/${id}`).then((r) => r.data),
  },
  // [R-6] 변경 이력(audit_log) — ADMIN. entity/entityId로 개별 세션 등의 이력 조회(최신순).
  audit: {
    list: (entity: string, entityId: number, limit?: number) =>
      http.get<AuditLog[]>("/audit", { params: { entity, entityId, limit } }).then((r) => r.data),
  },
};
