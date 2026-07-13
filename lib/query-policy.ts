import axios from "axios";

const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 409, 422]);

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (axios.isCancel(error)) return false;
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status != null && NON_RETRYABLE_STATUSES.has(status)) return false;
  return failureCount < 1;
}
