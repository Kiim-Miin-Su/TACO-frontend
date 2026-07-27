import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "../middleware";

describe("middleware", () => {
  it("passes same-origin API proxy requests without a browser session", () => {
    const response = middleware(
      new NextRequest("http://localhost/api/auth/login", { method: "POST" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("keeps redirecting unauthenticated protected pages", () => {
    const response = middleware(new NextRequest("http://localhost/students"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?redirect=%2Fstudents",
    );
  });

  it("preserves a protected deep link inside the redirect value only", () => {
    const response = middleware(
      new NextRequest("http://localhost/calendar?from=2026-07-27&view=week"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?redirect=%2Fcalendar%3Ffrom%3D2026-07-27%26view%3Dweek",
    );
  });
});
