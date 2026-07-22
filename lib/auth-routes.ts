// 비로그인으로 접근 가능한 공개(인증) 경로 — 단일 소스.
// middleware(가드)와 AppShell(앱 크롬 숨김)이 같은 목록을 참조해야 무결성이 유지됨.
// [TBO-31 C5 2026-07-20] /recover·/reset-password 등재 — 미등재로 비로그인 진입이 /login으로
//  튕겨 29C 복구 화면이 정작 대상(비로그인)에게 도달 불가였던 결함 수정(대표 재현 보고).
const PUBLIC_ROUTES = ["/login", "/signup", "/verify-email", "/recover", "/reset-password"] as const;
export const LOGOUT_ROUTE = "/logout";

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
