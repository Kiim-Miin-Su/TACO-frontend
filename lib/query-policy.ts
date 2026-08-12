import axios from "axios";
import type { QueryKey } from "@tanstack/react-query";

const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 409, 422]);

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (axios.isCancel(error)) return false;
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status != null && NON_RETRYABLE_STATUSES.has(status)) return false;
  return failureCount < 1;
}

/** 다른 직원/기기의 CRUD를 현재 활성 화면에 반영하는 최대 대기 시간. */
export const LIVE_SERVER_STATE_INTERVAL_MS = 15_000;

/** 공개 입력 검증·국가 카탈로그는 운영 업무 상태가 아니므로 주기 재조회에서 제외한다. */
export function serverStateRefetchInterval(queryKey: QueryKey): number | false {
  const [root, leaf] = queryKey;
  if (root === 'catalog' || root === 'nav-seen') return false;
  if (root === 'auth' && leaf !== 'pending') return false;
  return LIVE_SERVER_STATE_INTERVAL_MS;
}
