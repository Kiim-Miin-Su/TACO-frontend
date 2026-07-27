import { describe, expect, it } from "vitest";
import {
  defaultPostLoginLanding,
  internalRoute,
  positiveRouteId,
  resolvePostLoginDestination,
  safeInternalRedirect,
  type InternalHref,
} from "@/lib/navigation-security";

const knownInternalHref = "/calendar" satisfies InternalHref;
// @ts-expect-error External protocols must never enter shared navigation props.
const externalHref: InternalHref = "https://evil.example";
void knownInternalHref;
void externalHref;

describe("positiveRouteId", () => {
  it.each([
    ["1", 1],
    ["42", 42],
    ["2147483647", 2_147_483_647],
    [1, 1],
    [2_147_483_647, 2_147_483_647],
  ])("accepts a canonical PostgreSQL int id: %s", (candidate, expected) => {
    expect(positiveRouteId(candidate)).toBe(expected);
  });

  it.each([
    "",
    " ",
    "NaN",
    "Infinity",
    "0",
    "-1",
    "+1",
    "01",
    "1.0",
    "1.5",
    "1e3",
    "１２",
    "2147483648",
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    2_147_483_648,
    null,
    undefined,
  ])("rejects a non-canonical or out-of-range id: %s", (candidate) => {
    expect(positiveRouteId(candidate)).toBeNull();
  });
});

describe("internalRoute", () => {
  it("builds every dynamic application route through one boundary", () => {
    expect(internalRoute.adminCourse(1)).toBe("/admin/courses/1");
    expect(internalRoute.adminInstructor(2)).toBe("/admin/instructors/2");
    expect(internalRoute.adminRoadmap(3)).toBe("/admin/roadmaps/3");
    expect(internalRoute.adminUser(4)).toBe("/admin/users/4");
    expect(internalRoute.attendanceInstructor(5)).toBe("/attendance/instructor/5");
    expect(internalRoute.counsel(6)).toBe("/counsel/6");
    expect(internalRoute.expense(7)).toBe("/expenses/7");
    expect(internalRoute.payment(8)).toBe("/payments/8");
    expect(internalRoute.payoutInstructor(9)).toBe("/payouts/9");
    expect(internalRoute.payoutRecord(10)).toBe("/payouts/detail/10");
    expect(internalRoute.report(11)).toBe("/reports/11");
    expect(internalRoute.session(12)).toBe("/sessions/12");
    expect(internalRoute.sessionFeedback(12, 13)).toBe("/sessions/12/feedback/13");
    expect(internalRoute.student(14)).toBe("/students/14");
  });

  it.each([0, -1, 1.5, Number.NaN, 2_147_483_648])(
    "refuses to build a route with an invalid id: %s",
    (candidate) => {
      expect(() => internalRoute.student(candidate)).toThrow(RangeError);
    },
  );
});

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
    expect(resolvePostLoginDestination("/payouts", "instructor", false)).toBe("/");
    expect(resolvePostLoginDestination("/payouts/9", "manager", false)).toBe(
      "/admin/approvals",
    );
    expect(resolvePostLoginDestination("/payouts/9", "super_admin", false)).toBe(
      "/payouts/9",
    );
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
