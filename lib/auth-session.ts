import type { QueryClient } from "@tanstack/react-query";
import { resetPreferences } from "@/lib/storage/preferences";

/**
 * 계정 교체 경계. 진행 중인 이전 계정 요청을 먼저 취소하고 서버 캐시를 비운다.
 * 업무 데이터는 localStorage에 남기지 않으며, 계정 공용 UI 취향도 기본적으로 초기화한다.
 */
export async function clearAccountScopedClientState(
  queryClient: QueryClient,
  options: { preferences?: boolean } = {},
): Promise<void> {
  await queryClient.cancelQueries();
  queryClient.clear();
  if (options.preferences !== false) resetPreferences();
}
