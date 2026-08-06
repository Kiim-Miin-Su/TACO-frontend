// 비로그인으로 접근 가능한 공개(인증) 경로 — 단일 소스.
// middleware(가드)와 AppShell(앱 크롬 숨김)이 같은 목록을 참조해야 무결성이 유지됨.
// [TBO-31 C5 2026-07-20] /recover·/reset-password 등재 — 미등재로 비로그인 진입이 /login으로
//  튕겨 29C 복구 화면이 정작 대상(비로그인)에게 도달 불가였던 결함 수정(대표 재현 보고).
const PUBLIC_ROUTES = ["/login", "/signup", "/verify-email", "/recover", "/reset-password"] as const;
export const LOGOUT_ROUTE = "/logout";

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** [TBO-86I-5] open redirect 차단 — 복귀 대상은 같은 앱 내부 경로만("//" 프로토콜 상대 URL 금지). */
export function isInternalRedirectPath(path: string | null | undefined): path is string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//");
}

/** [TBO-86I-5] 터미널 세션 만료(401 + refresh 회전 실패) → 명시 로그아웃 단일 경로.
 *  /login으로 직행하면 stale access cookie가 남은 경우 미들웨어의 존재-기반 낙관 가드가
 *  로그인 화면을 앱으로 되튕겨 "화면은 살아있고 콘솔 401만 쌓이는" 결함이 된다(운영 실측).
 *  /logout route가 세션 쿠키 3종을 만료시킨 뒤 expired 안내·복귀 경로와 함께 /login으로 보낸다. */
export function sessionExpiredLogoutUrl(pathname: string, search = ""): string {
  const target = `${pathname}${search}`;
  const backTo = isInternalRedirectPath(target) && !isPublicRoute(pathname) && pathname !== LOGOUT_ROUTE
    ? `&redirect=${encodeURIComponent(target)}`
    : "";
  return `${LOGOUT_ROUTE}?expired=1${backTo}`;
}
