// [TBO-79 B4~B6] 회계 영향 확인(ack) 흐름의 공용 구현.
//
//  종전엔 이 상태 기계가 useUpdateSchedule 안에만 있었고, 같은 정산 델타를 만드는 다른 명령
//  (출결 초기화·승인 리포트 반려)에는 서버 게이트 자체가 없었다. 서버에 게이트를 추가하면서
//  클라이언트에도 같은 흐름이 필요해졌는데, 세 번째 사본을 만들지 않으려고 여기로 뺐다.
//
//  규약: 첫 요청 → 409(code + impact + impactHash) → 프롬프트 → 확인 시 같은 지문을 실어 1회 재시도.
//  맹목 확인은 서버가 막는다(지문 불일치 = 새 409로 최신 영향이 다시 열린다).
import { useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import type { SessionAccountingImpactConflict } from "@kms545487/contracts";

export type AccountingImpactPrompt = {
  payoutLocked: boolean;
  impactHash?: string;
  impact: SessionAccountingImpactConflict["impact"];
};

export function accountingPromptFromError(error: unknown): AccountingImpactPrompt | null {
  const data = (error as {
    response?: { data?: Partial<SessionAccountingImpactConflict> };
  }).response?.data;
  if (!data?.impact || (data.code !== "ACCOUNTING_IMPACT_ACK_REQUIRED" && data.code !== "PAYOUT_REVERSAL_REQUIRED"))
    return null;
  return {
    impact: data.impact,
    impactHash: data.impactHash,
    payoutLocked: data.code === "PAYOUT_REVERSAL_REQUIRED",
  };
}

/**
 * mutation을 감싸 회계 영향 409를 프롬프트로 승격한다.
 * `withAck`는 확인된 변수에 지문을 실어 재요청 변수를 만든다.
 *
 * 정산 연결(payoutLocked)은 확인으로 통과할 수 없다 — 회수가 선행이므로 재시도하지 않고
 * 프롬프트만 띄운다(사용자가 회수 경로를 밟아야 한다).
 */
export function useAccountingAck<TVariables>(
  mutation: UseMutationResult<unknown, unknown, TVariables, unknown>,
  withAck: (variables: TVariables, impactHash?: string) => TVariables,
) {
  const [pending, setPending] = useState<{ variables: TVariables; prompt: AccountingImpactPrompt } | null>(null);
  const mutate: typeof mutation.mutate = (variables, options) => mutation.mutate(variables, {
    ...options,
    onError: (error, vars, onMutateResult, context) => {
      const prompt = accountingPromptFromError(error);
      if (prompt) {
        setPending({ variables, prompt });
        return;
      }
      options?.onError?.(error, vars, onMutateResult, context);
    },
  });
  return {
    ...mutation,
    mutate,
    accountingPrompt: pending?.prompt ?? null,
    dismissAccountingPrompt: () => setPending(null),
    confirmAccountingImpact: () => {
      if (!pending) return;
      const { variables, prompt } = pending;
      setPending(null);
      if (!prompt.payoutLocked) mutate(withAck(variables, prompt.impactHash));
    },
  };
}
