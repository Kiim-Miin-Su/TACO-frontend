import { describe, expect, it } from "vitest";
import {
  defaultPostLoginLanding,
  resolvePostLoginDestination,
  safeInternalRedirect,
  type InternalHref,
} from "@/lib/navigation-security";

const knownInternalHref = "/calendar" satisfies InternalHref;
// @ts-expect-error External protocols must never enter shared navigation props.
const externalHref: InternalHref = "https://evil.example";
void knownInternalHref;
void externalHref;

describe("safeInternalRedirect", () => {
  it("keeps known same-origin paths with query and hash", () => {
    expect(safeInternalRedirect("/students/42?tab=family#history", "/")).toBe(
      "/students/42?tab=family#history",
    );
    expect(safeInternalRedirect("/calendar?from=2026-07-27", "/")).toBe(
      "/calendar?from=2026-07-27",
    );
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "https://evil.example/phish",
    "//evil.example/phish",
    "///evil.example/phish",
    "\\\\evil.example\\phish",
    "/\\evil.example/phish",
    "/%5C%5Cevil.example/phish",
    "/%2F%2Fevil.example/phish",
    "/%252F%252Fevil.example/phish",
    "%2F%2Fevil.example/phish",
    "/calendar\u0000",
    "/calendar\r\nLocation: https://evil.example",
    "/unknown-route",
  ])("rejects an unsafe or unknown destination: %s", (candidate) => {
    expect(safeInternalRedirect(candidate, "/calendar")).toBe("/calendar");
  });

  it("rejects an overlong destination", () => {
    expect(safeInternalRedirect(`/calendar?q=${"a".repeat(2100)}`, "/")).toBe("/");
  });
});

describe("resolvePostLoginDestination", () => {
  it("uses role-specific default landing pages", () => {
    expect(defaultPostLoginLanding("super_admin")).toBe("/admin/approvals");
    expect(defaultPostLoginLanding("admin")).toBe("/admin/approvals");
    expect(defaultPostLoginLanding("manager")).toBe("/admin/approvals");
    expect(defaultPostLoginLanding("instructor")).toBe("/");
  });

  it("allows only destinations authorized for the authenticated role", () => {
    expect(resolvePostLoginDestination("/admin/approvals", "manager", false)).toBe(
      "/admin/approvals",
    );
    expect(resolvePostLoginDestination("/payments/42", "super_admin", false)).toBe(
      "/payments/42",
    );
    expect(resolvePostLoginDestination("/admin/approvals", "instructor", false)).toBe("/");
    expect(resolvePostLoginDestination("/payments/42", "admin", false)).toBe(
      "/admin/approvals",
    );
    expect(resolvePostLoginDestination("/counsel/3", "instructor", false)).toBe("/");
  });

  it("does not redirect an authenticated user back to a public auth route", () => {
    expect(resolvePostLoginDestination("/login", "manager", false)).toBe(
      "/admin/approvals",
    );
    expect(resolvePostLoginDestination("/recover?tab=password", "instructor", false)).toBe(
      "/",
    );
  });

  it("always prioritizes mandatory credential rotation", () => {
    expect(
      resolvePostLoginDestination("/calendar", "super_admin", true),
    ).toBe("/account/security");
  });
});
