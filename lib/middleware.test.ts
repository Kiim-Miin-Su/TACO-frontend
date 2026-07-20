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
});
