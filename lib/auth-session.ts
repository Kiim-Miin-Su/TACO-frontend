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

/**
 * 로그아웃 중간에 account=null을 렌더링하면 현재 화면 query가 익명 scope로 다시 시작될 수 있다.
 * 서버 상태를 먼저 취소·폐기하고 cookie logout 뒤 hard navigation만 수행한다.
 */
export async function endBrowserAccountSession(
  queryClient: QueryClient,
  logoutRequest: () => Promise<unknown>,
  navigate: () => void,
): Promise<void> {
  await clearAccountScopedClientState(queryClient);
  try {
    await logoutRequest();
  } catch {
    // fallback route가 access/refresh cookie를 다시 만료하므로 이동은 항상 계속한다.
  }
  navigate();
}
