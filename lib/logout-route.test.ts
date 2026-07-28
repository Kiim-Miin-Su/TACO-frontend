import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/logout/route";

describe("GET /logout", () => {
  it("access/refresh/sudo HttpOnly cookies를 발급 path 그대로 즉시 만료한다", () => {
    const response = GET(new NextRequest("https://erp.example.test/logout"));
    const cookies = response.cookies.getAll();

    expect(cookies.map((cookie) => cookie.name)).toEqual(["access_token", "refresh_token", "sudo_token"]);
    // [75B] 만료는 발급 path와 일치해야 적용된다 — backend browser-session.ts 계약과 동일 매핑.
    const expectedPath: Record<string, string> = {
      access_token: "/",
      refresh_token: "/api/auth", // 종전 "/"로 만료해 refresh가 잔존하던 P1 회귀 방지
      sudo_token: "/",
    };
    for (const cookie of cookies) {
      expect(cookie.value).toBe("");
      expect(cookie.path).toBe(expectedPath[cookie.name]);
      expect(cookie.httpOnly).toBe(true);
      expect(cookie.sameSite).toBe("lax");
      expect(cookie.secure).toBe(true);
      expect(cookie.maxAge).toBe(0);
    }
  });

  it("http(비 https) 요청에는 secure를 붙이지 않는다(로컬 개발 동작 보존)", () => {
    const response = GET(new NextRequest("http://localhost:3000/logout"));
    for (const cookie of response.cookies.getAll()) expect(cookie.secure ?? false).toBe(false);
  });
});
