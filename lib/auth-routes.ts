// 비로그인으로 접근 가능한 공개(인증) 경로 — 단일 소스.
// middleware(가드)와 AppShell(앱 크롬 숨김)이 같은 목록을 참조해야 무결성이 유지됨.
export const PUBLIC_ROUTES = ["/login", "/signup", "/verify-email"] as const;

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
