// 결제·지출·원장·매출(GraphQL)·수업 보고서·정산 도메인 API — lib/api.ts에서 분할(순수 이동).
import { http } from "./client";
import type { CounselAnalyticsRange } from "./students";
import type {
  Payment,
  Expense,
  Transaction,
  CreatePaymentInput,
  UpdatePaymentInput,
  CreateExpenseInput,
  ReportApprovalStatus,
  ReportStatus,
  PayReadiness,
  SessionReport as SessionReportContract,
  SessionReportView as SessionReportViewContract,
  InstructorPayout,
  PayoutLine as ContractPayoutLine,
  PayoutMeasure as ContractPayoutMeasure,
  BulkGeneratePayoutResult as ContractBulkGeneratePayoutResult,
  PayoutWorksheetPricing as ContractPayoutWorksheetPricing,
  PayoutWorksheetRow as ContractPayoutWorksheetRow,
  PayoutWorksheet as ContractPayoutWorksheet,
  RevenueKeyAmount as ContractRevenueKeyAmount,
  RevenueReport as ContractRevenueReport,
  FinanceSummary as ContractFinanceSummary,
  CeoDashboard as ContractCeoDashboard,
  PayoutStatus,
} from "@kms545487/contracts";

// ── TBO-05 시수·페이 정산 타입(백엔드 reports/payouts 모듈 응답) ──
type SessionReportRecord = SessionReportContract & { createdAt: string; updatedAt: string };
export type SessionReport = SessionReportViewContract & { createdAt: string; updatedAt: string };
// 정산 라인(세션 1건 산정 스냅샷)
export type PayoutLine = ContractPayoutLine;
// 산정 미리보기(읽기전용)
export type MeasureResult = ContractPayoutMeasure;
export type PayoutRowStatus = PayoutStatus;

// GraphQL/REST 응답은 contracts가 정본이고 이 별칭은 기존 소비자 import 호환만 담당한다.
export type RevenueKeyAmount = ContractRevenueKeyAmount;
export type RevenueReport = ContractRevenueReport;
export type FinanceSummary = ContractFinanceSummary;

// [TBO-32 C4] 미정산 감지·일괄 산정 응답 — BE C1/C2 계약.
export type UncoveredPayoutEntry = {
  instructorId: number; instructorName: string; instructorStatus: string; month: string;
  periodStart: string; periodEnd: string; sessionCount: number; totalMinutes: number; computedAmount: number;
  executionMissingCount: number; // [TBO-66 T2] 실행 미확정(종료 경과 scheduled)
};
export type BulkGenerateResult = ContractBulkGeneratePayoutResult;
export type PayoutRow = InstructorPayout & { createdAt: string; updatedAt: string };
export type LedgerTx = {
  id: number; direction: "in" | "out"; category: string; label: string;
  amount: number; occurredAt: string; payoutId?: number;
};

export const financeApi = {
  payments: {
    list: () => http.get<Payment[]>("/payments").then((r) => r.data),
    get: (id: number) => http.get<Payment>(`/payments/${id}`).then((r) => r.data), // [B7 E3] 상세 단건
    create: (input: CreatePaymentInput) => http.post<Payment>("/payments", input).then((r) => r.data),
    update: (id: number, patch: UpdatePaymentInput) => http.patch<Payment>(`/payments/${id}`, patch).then((r) => r.data),
    markPaid: (id: number) => http.post<Payment>(`/payments/${id}/pay`, {}).then((r) => r.data),
    // 환불(원장 완결성 2026-07-03): paid → refunded + 원장 출금 1줄(paymentId 역참조). 멱등은 백엔드 400.
    refund: (id: number) => http.post<Payment>(`/payments/${id}/refund`, {}).then((r) => r.data),
  },
  expenses: {
    list: () => http.get<Expense[]>("/expenses").then((r) => r.data),
    get: (id: number) => http.get<Expense>(`/expenses/${id}`).then((r) => r.data), // [B7 E3] 상세 단건
    create: (input: CreateExpenseInput) => http.post<Expense>("/expenses", input).then((r) => r.data),
    // [TBO-58 P2] 오기입 정정(requested만 — 승인 후엔 서버 400, 원장 정합) + 철회(soft delete)
    update: (id: number, patch: Partial<CreateExpenseInput>) => http.patch<Expense>(`/expenses/${id}`, patch).then((r) => r.data),
    remove: (id: number) => http.delete<{ id: number; deleted: true }>(`/expenses/${id}`).then((r) => r.data),
    approve: (id: number) => http.post<Expense>(`/expenses/${id}/approve`, {}).then((r) => r.data),
    // 반려 사유 **필수**(Q2 2026-07-06 — 반려류 패턴 통일). 서버 저장(Expense.rejectedReason).
    reject: (id: number, reason: string) => http.post<Expense>(`/expenses/${id}/reject`, { reason }).then((r) => r.data),
  },
  // [TBO-46 G2] GraphQL 게이트웨이(읽기 전용·대표 전용) — 매출·재무는 서버 파생 1쿼리로 소비
  graphql: {
    revenueReport: (range: CounselAnalyticsRange = {}) =>
      http.post<{ data: { revenueReport: RevenueReport } }>("/graphql", {
        query: `query Revenue($from: String, $to: String) { revenueReport(from: $from, to: $to) {
          from to realizedTotal unpaidTotal unpaidCount
          byMonth { key amount count } bySubject { key amount count }
          byCourse { key amount count } byStudent { key amount count } } }`,
        variables: { from: range.from ?? null, to: range.to ?? null },
      }).then((r) => r.data.data.revenueReport),
    // [TBO-60 2026-07-24] 대표 대시보드 — 한 쿼리로 D1 재무+D2 aging+D3 증감+D6 수익성(서버 파생).
    ceoDashboard: (range: CounselAnalyticsRange = {}) =>
      http.post<{ data: { ceoDashboard: CeoDashboard } }>("/graphql", {
        query: `query Ceo($from: String, $to: String) { ceoDashboard(from: $from, to: $to) {
          from to finance { revenue expenses payouts net }
          receivables { bucket amount count }
          enrollmentTrend { month started ended net }
          courseProfit { courseId courseName revenue cost profit } } }`,
        variables: range,
      }).then((r) => r.data.data.ceoDashboard),
    financeSummary: (range: CounselAnalyticsRange = {}) =>
      http.post<{ data: { financeSummary: FinanceSummary } }>("/graphql", {
        query: `query Finance($from: String, $to: String) { financeSummary(from: $from, to: $to) { from to revenue expenses payouts net } }`,
        variables: { from: range.from ?? null, to: range.to ?? null },
      }).then((r) => r.data.data.financeSummary),
  },
  transactions: {
    list: () => http.get<Transaction[]>("/transactions").then((r) => r.data),
  },
  // ── 수업 보고서(TBO-05) — 강사 제출 → 관리자 승인/반려 ──
  reports: {
    list: (sessionId?: number) =>
      http.get<SessionReport[]>("/reports", { params: sessionId ? { sessionId } : undefined }).then((r) => r.data),
    get: (id: number) => http.get<SessionReport>(`/reports/${id}`).then((r) => r.data), // [TBO-58 P2] 상세 딥링크
    create: (body: { sessionId: number; studentId: number; instructorId?: number; content: string; progressPage?: string; homework?: string; status?: "draft" | "submitted" }) =>
      http.post<SessionReportRecord>("/reports", body).then((r) => r.data),
    // [TBO-76 76D] 기존 보고서 작성값 수정 — 조인 헤더는 입력받지 않는다.
    update: (id: number, body: { content?: string; progressPage?: string; homework?: string }) =>
      http.patch<SessionReportRecord>(`/reports/${id}`, body).then((r) => r.data),
    submit: (id: number) => http.post<SessionReportRecord>(`/reports/${id}/submit`, {}).then((r) => r.data),
    approve: (id: number, approvedBy?: number) =>
      http.post<SessionReportRecord>(`/reports/${id}/approve`, { approvedBy }).then((r) => r.data),
    reject: (id: number, reason?: string) =>
      http.post<SessionReportRecord>(`/reports/${id}/reject`, { reason }).then((r) => r.data),
    remove: (id: number) =>
      http.delete<{ id: number; deleted: true }>(`/reports/${id}`).then((r) => r.data),
  },
  // ── 강사 페이 정산(TBO-05) — 시수×시급 산정 → 승인 → 지급 ──
  payouts: {
    list: () => http.get<PayoutRow[]>("/payouts").then((r) => r.data),
    mine: () => http.get<PayoutRow[]>("/payouts/me").then((r) => r.data),
    get: (id: number) => http.get<PayoutRow>(`/payouts/${id}`).then((r) => r.data),
    // 읽기전용 산정 미리보기(정산서 생성 없음). 적격: held + 승인 보고서.
    preview: (instructorId: number, from: string, to: string) =>
      http.get<MeasureResult>("/payouts/preview", { params: { instructorId, from, to } }).then((r) => r.data),
    // [TBO-62 ⑥ 2026-07-24] 강사용 preview/readiness 제거 — 강사는 지급 완료(paid) 내역만(서버 라우트 삭제).
    readiness: (params: { instructorId?: number; from?: string; to?: string } = {}) =>
      http.get<PayReadiness>("/payouts/readiness", { params }).then((r) => r.data),
    // [TBO-74 C1] 시수 워크시트 — 회차별 출결·리포트·가격 분류·합계(대표 전용).
    worksheet: (instructorId: number, from: string, to: string) =>
      http.get<PayoutWorksheet>("/payouts/worksheet", { params: { instructorId, from, to } }).then((r) => r.data),
    // [TBO-32 C4 2026-07-22] 미정산 감지·일괄 산정·확정 취소 — BE C1/C2 라우트 소비.
    uncovered: (months = 3) =>
      http.get<UncoveredPayoutEntry[]>("/payouts/uncovered", { params: { months } }).then((r) => r.data),
    generateBulk: (periodStart: string, periodEnd: string, instructorIds?: number[]) =>
      http.post<BulkGenerateResult>("/payouts/generate-bulk", { periodStart, periodEnd, ...(instructorIds?.length ? { instructorIds } : {}) }).then((r) => r.data),
    unconfirm: (id: number, reason: string) =>
      http.post<PayoutRow>(`/payouts/${id}/unconfirm`, { reason }).then((r) => r.data),
    // 정산서 생성(pending) + 세션 연결(이중 계상 방지)
    generate: (instructorId: number, from: string, to: string) =>
      http.post<PayoutRow>("/payouts/generate", { instructorId, from, to }).then((r) => r.data),
    confirm: (id: number) => http.post<PayoutRow>(`/payouts/${id}/confirm`, {}).then((r) => r.data),
    // 관리자 급여 수정(실효 지급액 덮어쓰기, 자동 산정액 보존)
    adjust: (id: number, amount: number, reason: string) =>
      http.post<PayoutRow>(`/payouts/${id}/adjust`, { amount, reason }).then((r) => r.data),
    reject: (id: number, reason?: string) =>
      http.post<PayoutRow>(`/payouts/${id}/reject`, { reason }).then((r) => r.data),
    // 지급 완료(confirmed → paid) + 통합 원장 출금 기록
    pay: (id: number) =>
      http.post<{ payout: PayoutRow; transaction: LedgerTx }>(`/payouts/${id}/pay`, {}).then((r) => r.data),
    // [B9 E5 2026-07-16] 지급 회수(paid → rejected+reversedAt) + 원장 반대 분개 — 대표 전용.
    //  사유 필수(서버 DTO MinLength 5 — 미달 시 400).
    reverse: (id: number, reason: string) =>
      http.post<{ payout: PayoutRow; transaction: LedgerTx }>(`/payouts/${id}/reverse`, { reason }).then((r) => r.data),
  },
};

export type WorksheetPricing = ContractPayoutWorksheetPricing;
export type PayoutWorksheetRow = ContractPayoutWorksheetRow;
export type PayoutWorksheet = ContractPayoutWorksheet;
export type CeoDashboard = ContractCeoDashboard;
