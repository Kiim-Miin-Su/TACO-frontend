import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/logout/route";

describe("GET /logout", () => {
  it("access/refresh HttpOnly cookies를 모두 즉시 만료한다", () => {
    const response = GET(new NextRequest("https://erp.example.test/logout"));
    const cookies = response.cookies.getAll();

    expect(cookies.map((cookie) => cookie.name)).toEqual(["access_token", "refresh_token"]);
    for (const cookie of cookies) {
      expect(cookie.value).toBe("");
      expect(cookie.path).toBe("/");
      expect(cookie.httpOnly).toBe(true);
      expect(cookie.sameSite).toBe("lax");
      expect(cookie.secure).toBe(true);
      expect(cookie.maxAge).toBe(0);
    }
  });
});
