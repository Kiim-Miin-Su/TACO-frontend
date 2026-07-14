import { NextResponse, type NextRequest } from "next/server";
import { isPublicRoute, LOGOUT_ROUTE } from "@/lib/auth-routes";

// 비로그인 강제 가드: token 쿠키가 없으면 /login으로 리다이렉트.
// (데모 수준 — 존재 여부만 확인. 서명 검증은 백엔드 /auth/me 책임.)
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("token")?.value;
  const isPublic = isPublicRoute(pathname);

  // 로그아웃 route handler가 응답에서 token cookie를 만료시키고 /login으로 이동한다.
  // 기존 업무 화면을 먼저 무토큰 상태로 만들지 않아 active query의 401 경합을 막는다.
  if (pathname === LOGOUT_ROUTE) return NextResponse.next();

  if (!token && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }
  // 로그인 세션이 있으면 공개 인증 화면(로그인/가입/인증)을 다시 노출하지 않음.
  if (token && isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// 정적 자원·이미지·폰트·내부 경로는 가드 제외
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|woff2?)$).*)"],
};
