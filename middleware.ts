import { NextResponse, type NextRequest } from "next/server";
import { isPublicRoute } from "@/lib/auth-routes";

// 비로그인 강제 가드: token 쿠키가 없으면 /login으로 리다이렉트.
// (데모 수준 — 존재 여부만 확인. 서명 검증은 백엔드 /auth/me 책임.)
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("token")?.value;
  const isPublic = isPublicRoute(pathname);

  if (!token && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }
  // 이미 로그인했는데 /login이면 홈으로
  if (token && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// 정적 자원·이미지·내부 경로는 가드 제외
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
