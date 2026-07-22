import { NextResponse, type NextRequest } from "next/server";

export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  // 백엔드 logout이 일시 실패해도 브라우저에 인증 수명이 남지 않도록 두 HttpOnly cookie를
  // 같은 정책으로 만료한다. 학생·강사·수업 등 business entity는 cookie에 저장하지 않는다.
  for (const name of ["access_token", "refresh_token"]) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
    });
  }
  return response;
}
