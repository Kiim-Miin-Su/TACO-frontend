import { NextResponse, type NextRequest } from "next/server";
import { isPublicRoute, LOGOUT_ROUTE } from "@/lib/auth-routes";

// 비로그인 낙관적 가드: HttpOnly access cookie 존재만 확인한다.
// 서명·계정 상태·권한의 실제 판정은 backend /auth/me와 RolesGuard 책임이다.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /api는 same-origin backend proxy다. 인증 UI redirect를 적용하면 login/refresh 자체가
  // backend에 도달하지 못하므로 API의 인증·권한 판정은 backend guard에 맡긴다.
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const hasSession = Boolean(req.cookies.get("access_token")?.value);
  const isPublic = isPublicRoute(pathname);

  // 로그아웃 route handler가 응답에서 session cookie를 만료시키고 /login으로 이동한다.
  // 기존 업무 화면을 먼저 무토큰 상태로 만들지 않아 active query의 401 경합을 막는다.
  if (pathname === LOGOUT_ROUTE) return NextResponse.next();

  if (!hasSession && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }
  // 로그인 세션이 있으면 공개 인증 화면(로그인/가입/인증)을 다시 노출하지 않음.
  if (hasSession && isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// 정적 자원·이미지·폰트·내부 경로는 가드 제외
export const config = {
  matcher: ["/((?!api(?:/|$)|_next/static|_next/image|favicon.ico|fonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|woff2?)$).*)"],
};
