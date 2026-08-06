"use client";
// 결제·지출·원장·매출·수업 보고서·정산 도메인 훅 — lib/queries.ts에서 분할(순수 이동).
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAccountingAck } from './accounting-ack'; // [TBO-79 B5]
import { qk } from "@/lib/queryKeys";
import { useAccountAccess } from "@/lib/useAccountAccess";
import { logger } from "@/lib/log";
import { detailRetry, useInvalidator } from "./shared";
import { toStoreReport } from "@/lib/domain/report-view";
import type { ReportListQuery, ReportWorklistQuery } from '@kms545487/contracts';

// [TBO-54 C2 대표 지시 콘솔 로깅] 머니 액션 관측 — id·금액·결과만(PII 0).
const moneyLog = logger("money");

export const usePayments = () => {
  const { can } = useAccountAccess();
  return useQuery({ queryKey: qk.payments.list(), queryFn: () => api.payments.list(), enabled: can("finance.access") });
};
export const useTransactions = () => {
  const { can } = useAccountAccess();
  return useQuery({ queryKey: qk.transactions.list(), queryFn: () => api.transactions.list(), enabled: can("finance.access") });
};
export const useExpenses = () => {
  const { can } = useAccountAccess();
  return useQuery({ queryKey: qk.expenses.list(), queryFn: () => api.expenses.list(), enabled: can("finance.access") });
};
// [TBO-21 RBAC] 정산 전체 조회는 대표 전용(403) — 비대표는 fetch 비활성(403 재시도 노이즈 방지)
export const usePayouts = () => {
  const { can } = useAccountAccess();
  return useQuery({ queryKey: qk.payouts.list(), queryFn: () => api.payouts.list(), enabled: can("finance.access") });
};
export const useMyPayouts = () => {
  const { scope, can } = useAccountAccess();
  return useQuery({ queryKey: qk.payouts.mine(scope), queryFn: () => api.payouts.mine(), enabled: can("instructor.self") });
};
// [상태 무결성 2026-07-06] 산정 미리보기(읽기전용) — 강사·기간 키 캐시(PayoutsView 로컬 fetch 대체).
//  mutation 성공 시 qk.payouts.all 무효화가 preview 키도 접두사로 포함 → 자동 재계산.
export const usePayoutPreview = (instructorId: number | null, from: string, to: string) => {
  const { can } = useAccountAccess();
  return useQuery({
    queryKey: qk.payouts.preview(instructorId ?? 0, from, to),
    queryFn: () => api.payouts.preview(instructorId as number, from, to),
    enabled: can("finance.access") && instructorId != null && !!from && !!to,
  });
};
// [TBO-74 C1] 시수 워크시트 — 회차·출결·가격 분류·합계(대표 전용). 출결·가격 mutation이
//  qk.payouts/qk.schedule을 무효화하므로 자동 재계산된다.
export const usePayoutWorksheet = (instructorId: number | null, from: string, to: string) => {
  const { can } = useAccountAccess();
  return useQuery({
    queryKey: qk.payouts.worksheet(instructorId ?? 0, from, to),
    queryFn: () => api.payouts.worksheet(instructorId as number, from, to),
    enabled: can("finance.access") && instructorId != null && !!from && !!to,
    // [TBO-66 F3] 금전 화면 한정 신선도 상향 — 타 매니저의 출결 기록(서버 자동 전이)이 포커스 복귀 시 반영
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
};
export const useSetSessionPayAmount = () =>
  useMutation({
    mutationFn: (v: { id: number; amount: number | null }) => api.schedule.setPayAmount(v.id, v.amount),
    onSuccess: useInvalidator([qk.payouts.all, qk.schedule.all]),
  });

// [TBO-46 G2] 매출 보고 — GraphQL 서버 파생 소비(전 목록 5개 클라 조인 대체). 대표(finance) 전용.
export const useRevenueReport = (range: { from?: string | null; to?: string | null } = {}) => {
  const { can } = useAccountAccess();
  return useQuery({
    queryKey: qk.revenue.report(range.from, range.to),
    queryFn: () => api.graphql.revenueReport(range),
    enabled: can("finance.access"),
  });
};
export const useFinanceSummary = (range: { from?: string | null; to?: string | null } = {}) => {
  const { can } = useAccountAccess();
  return useQuery({
    queryKey: qk.revenue.summary(range.from, range.to),
    queryFn: () => api.graphql.financeSummary(range),
    enabled: can("finance.access"),
  });
};
// [TBO-60→66 F1 정정] 대표 대시보드 — revenue 무효화는 수납·지출 승인·정산 전이 훅에 **명시**돼 있다(하위 키 자동 아님).
export const useCeoDashboard = (range: { from?: string | null; to?: string | null } = {}) => {
  const { can } = useAccountAccess();
  return useQuery({
    queryKey: qk.revenue.ceo(range.from, range.to),
    queryFn: () => api.graphql.ceoDashboard(range),
    enabled: can("finance.access"),
  });
};

export const usePayment = (id: number | null) => {
  const { can } = useAccountAccess();
  return useQuery({ queryKey: qk.payments.detail(id ?? 0), queryFn: () => api.payments.get(id as number), enabled: can("finance.access") && id != null, retry: detailRetry });
};
export const useExpense = (id: number | null) => {
  const { can } = useAccountAccess();
  return useQuery({ queryKey: qk.expenses.detail(id ?? 0), queryFn: () => api.expenses.get(id as number), enabled: can("finance.access") && id != null, retry: detailRetry });
};

// 보고서는 store 모델로 매핑해서 반환(배지·리포트 화면이 store 형상 사용).
export const useReports = (query: ReportListQuery = {}) => {
  const { scope } = useAccountAccess();
  return useQuery({ queryKey: qk.reports.list(query, scope), queryFn: async () => (await api.reports.list(query)).map(toStoreReport) });
};
export const useReportWorklist = (query: ReportWorklistQuery = {}) => {
  const { scope } = useAccountAccess();
  return useQuery({
    queryKey: qk.reports.worklist(query, scope),
    queryFn: () => api.reports.worklist(query),
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
};
// [TBO-58 P2] 보고서 단건 — /reports/[id] 딥링크(강사는 본인 것만: 서버 403 그대로 표면)
export const useReport = (id: number | null) =>
  useQuery({
    queryKey: qk.reports.detail(id ?? -1),
    queryFn: async () => toStoreReport(await api.reports.get(id!)),
    enabled: id != null,
  });

// 결제
// [TBO-56 C2b] 생성·정정도 매출 보고(미수금 포함) 입력이 바뀐다 — qk.revenue 무효화 누락(TBO-55 확정 갭 ①) 해소.
export const useCreatePayment = () => useMutation({ mutationFn: api.payments.create, onSuccess: useInvalidator([qk.payments.all, qk.revenue.all]) });
export const useUpdatePayment = () =>
  useMutation({ mutationFn: (v: { id: number; patch: Parameters<typeof api.payments.update>[1] }) => api.payments.update(v.id, v.patch), onSuccess: useInvalidator([qk.payments.all, qk.revenue.all]) });
// [TBO-54 C2] 수납·환불 = 원장·매출 파생까지 한 세트 무효화(qk.revenue — TBO-50 P1 갭 해소) + 콘솔 로그(PII 0).
export const useMarkPaymentPaid = () => {
  const invalidate = useInvalidator([qk.payments.all, qk.transactions.all, qk.revenue.all]);
  return useMutation({
    mutationFn: api.payments.markPaid,
    onSuccess: (row) => { moneyLog.info(`action=markPaid payment=${row.id} amount=${row.paidAmount} result=paid`); return invalidate(); },
  });
};
export const useRefundPayment = () => {
  const invalidate = useInvalidator([qk.payments.all, qk.transactions.all, qk.revenue.all]);
  return useMutation({
    mutationFn: api.payments.refund,
    onSuccess: (row) => { moneyLog.info(`action=refund payment=${row.id} result=refunded`); return invalidate(); },
  });
};

// 지출(승인 워크플로우)
export const useCreateExpense = () => useMutation({ mutationFn: api.expenses.create, onSuccess: useInvalidator([qk.expenses.all]) });
// [TBO-66 F1] 지출 승인 = financeSummary·대표 대시보드 입력(expenses.approved) — revenue까지 무효화
export const useApproveExpense = () => useMutation({ mutationFn: api.expenses.approve, onSuccess: useInvalidator([qk.expenses.all, qk.transactions.all, qk.revenue.all]) });
export const useRejectExpense = () =>
  useMutation({
    // 반려 사유 **필수**(Q2 — 서버 DTO @IsNotEmpty와 정합)
    mutationFn: (v: { id: number; reason: string }) => api.expenses.reject(v.id, v.reason),
    onSuccess: useInvalidator([qk.expenses.all]),
  });
// [TBO-58 P2] 오기입 정정(requested만) — 서버가 상태 가드(승인 후 400)·CAS까지 판정
export const useUpdateExpense = () =>
  useMutation({
    mutationFn: (v: { id: number; patch: Parameters<typeof api.expenses.update>[1] }) => api.expenses.update(v.id, v.patch),
    onSuccess: useInvalidator([qk.expenses.all]),
  });
// [TBO-58 P2] 철회(soft delete, requested만) — 원장 무기록이라 transactions 무효화 불요
export const useWithdrawExpense = () => useMutation({ mutationFn: api.expenses.remove, onSuccess: useInvalidator([qk.expenses.all]) });

// 리포트(작성·제출·승인/반려) — 승인은 시수/정산 적격 변동
export const useCreateReport = () => useMutation({ mutationFn: api.reports.create, onSuccess: useInvalidator([qk.reports.all, qk.payouts.all, qk.schedule.all, qk.audit.all]) });
// [E0.6 H1] 기존 보고서 임시 저장(본문/숙제 수정) — 승인 전까지.
// [TBO-62 ① 2026-07-24] body에 id가 섞여 서버 whitelist 400("property id should not exist") — 운영 콘솔 실측. patch만 전송.
export const useUpdateReport = () =>
  useMutation({ mutationFn: ({ id, ...patch }: { id: number; content?: string; progressPage?: string; homework?: string }) => api.reports.update(id, patch), onSuccess: useInvalidator([qk.reports.all, qk.payouts.all, qk.schedule.all, qk.audit.all]) });
export const useSubmitReport = () => useMutation({ mutationFn: api.reports.submit, onSuccess: useInvalidator([qk.reports.all, qk.payouts.all, qk.schedule.all, qk.audit.all]) });
export const useRemoveReport = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.reports.remove,
    onMutate: (id) => queryClient.cancelQueries({ queryKey: qk.reports.detail(id) }),
    onSuccess: async () => {
      // Keep the active detail cache until the caller redirects. Removing an active query
      // makes useQuery recreate it for one render and produces a noisy post-delete 404.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.reports.all }), // [TBO-79 G4] 인라인 리터럴 제거
        queryClient.invalidateQueries({ queryKey: qk.payouts.all }),
        queryClient.invalidateQueries({ queryKey: qk.schedule.all }),
        queryClient.invalidateQueries({ queryKey: qk.audit.all }),
      ]);
    },
  });
};
export const useApproveReport = () =>
  useMutation({ mutationFn: (v: { id: number }) => api.reports.approve(v.id), onSuccess: useInvalidator([qk.reports.all, qk.payouts.all, qk.schedule.all, qk.audit.all]) });
// [TBO-79 B5] 승인 리포트 반려는 세션을 정산 적격에서 빼낸다 — 서버가 영향 확인을 요구한다.
type RejectReportVars = {
  id: number;
  reason?: string;
  acknowledgeAccountingImpact?: boolean;
  expectedAccountingImpactHash?: string;
};
export const useRejectReport = () => {
  const mutation = useMutation({
    mutationFn: (v: RejectReportVars) => api.reports.reject(v.id, {
      reason: v.reason,
      acknowledgeAccountingImpact: v.acknowledgeAccountingImpact,
      expectedAccountingImpactHash: v.expectedAccountingImpactHash,
    }),
    onSuccess: useInvalidator([qk.reports.all, qk.payouts.all, qk.schedule.all, qk.audit.all]),
  });
  return useAccountingAck(mutation, (variables, impactHash) => ({
    ...variables,
    acknowledgeAccountingImpact: true,
    expectedAccountingImpactHash: impactHash,
  }));
};

// 정산(강사 페이) — 생성/확정/지급/반려/조정
export const useGeneratePayout = () =>
  useMutation({ mutationFn: (v: { instructorId: number; from: string; to: string }) => api.payouts.generate(v.instructorId, v.from, v.to), onSuccess: useInvalidator([qk.payouts.all, qk.schedule.all]) }); // [TBO-66 F4] 세션 payoutId — bulk와 대칭
// [TBO-66 F1] 확정·지급·회수·반려·취소 = CEO courseProfit(confirmed·paid)·financeSummary 입력 — revenue 무효화
export const useConfirmPayout = () => useMutation({ mutationFn: api.payouts.confirm, onSuccess: useInvalidator([qk.payouts.all, qk.revenue.all]) });
export const usePayPayout = () => useMutation({ mutationFn: api.payouts.pay, onSuccess: useInvalidator([qk.payouts.all, qk.transactions.all, qk.revenue.all, qk.schedule.all]) }); // [TBO-66 F1·F4] revenue + 세션 isPaid(비대칭 정리)
export const useRejectPayout = () =>
  useMutation({ mutationFn: (v: { id: number; reason?: string }) => api.payouts.reject(v.id, v.reason), onSuccess: useInvalidator([qk.payouts.all, qk.schedule.all, qk.revenue.all]) }); // [TBO-66 F1]
// [B9 E5 2026-07-16] 지급 회수(paid → rejected+reversedAt) — 원장 반대 분개(transactions) 반영 +
//  세션 잠금 해제가 캘린더 편집 가능성에 반영(useRejectPayout과 동일 근거로 schedule도 무효화).
export const useReversePayout = () =>
  useMutation({ mutationFn: (v: { id: number; reason: string }) => api.payouts.reverse(v.id, v.reason), onSuccess: useInvalidator([qk.payouts.all, qk.transactions.all, qk.schedule.all, qk.revenue.all]) }); // [TBO-66 F1]
export const useAdjustPayout = () =>
  useMutation({ mutationFn: (v: { id: number; amount: number; reason: string }) => api.payouts.adjust(v.id, v.amount, v.reason), onSuccess: useInvalidator([qk.payouts.all]) });
// [TBO-32 C4 2026-07-22] 단건 상세(B7 규약 — DetailStates 소비, 강사=본인만·타인 403)·미정산 감지·
//  일괄 산정·확정 취소 — 전 화면이 이 중앙 훅만 소비(§18-2 단일 진실원).
export const usePayout = (id: number | null) => {
  const { can } = useAccountAccess();
  const finance = can("finance.access");
  return useQuery({ queryKey: qk.payouts.detail(id ?? 0), queryFn: () => api.payouts.get(id as number), enabled: id != null && finance });
};
export const useUncoveredPayouts = (months = 3) => {
  const { can } = useAccountAccess();
  return useQuery({ queryKey: qk.payouts.uncovered(months), queryFn: () => api.payouts.uncovered(months), enabled: can("finance.access"), refetchOnWindowFocus: true, staleTime: 15_000 }); // [TBO-66 F3]
};
export const useGenerateBulkPayouts = () =>
  useMutation({
    mutationFn: (v: { periodStart: string; periodEnd: string; instructorIds?: number[] }) => api.payouts.generateBulk(v.periodStart, v.periodEnd, v.instructorIds),
    onSuccess: useInvalidator([qk.payouts.all, qk.schedule.all]),
  });
export const useUnconfirmPayout = () =>
  useMutation({ mutationFn: (v: { id: number; reason: string }) => api.payouts.unconfirm(v.id, v.reason), onSuccess: useInvalidator([qk.payouts.all, qk.revenue.all]) }); // [TBO-66 F1]
