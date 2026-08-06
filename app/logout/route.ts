import { NextResponse, type NextRequest } from "next/server";
import { isInternalRedirectPath } from "@/lib/auth-routes";

// [75B] 만료 쿠키는 발급 path와 정확히 일치해야 브라우저가 삭제한다(RFC 6265 — name+path 매칭).
//  backend browser-session.ts 계약과 동일한 매핑: access·sudo=Path=/, refresh=Path=/api/auth.
//  종전엔 refresh_token을 path=/로 만료해 backend logout 일시 실패 시 장수명 refresh cookie가
//  브라우저에 잔존했다(fallback의 존재 이유가 refresh에 대해 무효였던 P1).
const SESSION_COOKIE_PATHS = [
  ["access_token", "/"],
  ["refresh_token", "/api/auth"],
  ["sudo_token", "/"],
] as const;

export function GET(request: NextRequest) {
  // [TBO-86I-5] 터미널 세션 만료 경로의 가시성 — expired 안내와 안전한 내부 복귀 경로만 /login으로
  //  전달한다(open redirect 차단은 isInternalRedirectPath + 로그인 페이지의 resolvePostLoginDestination 이중).
  const loginUrl = new URL("/login", request.url);
  if (request.nextUrl.searchParams.get("expired") === "1") loginUrl.searchParams.set("expired", "1");
  const backTo = request.nextUrl.searchParams.get("redirect");
  if (isInternalRedirectPath(backTo)) loginUrl.searchParams.set("redirect", backTo);
  const response = NextResponse.redirect(loginUrl);
  // 백엔드 logout이 일시 실패해도 브라우저에 인증·재인증 수명이 남지 않도록 HttpOnly cookie를
  // 같은 정책으로 만료한다. 학생·강사·수업 등 business entity는 cookie에 저장하지 않는다.
  for (const [name, path] of SESSION_COOKIE_PATHS) {
    response.cookies.set(name, "", {
      path,
      maxAge: 0,
      sameSite: "lax",
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
    });
  }
  return response;
}
