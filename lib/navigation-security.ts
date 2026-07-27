import { hasCapability, type AppCapability } from "@/lib/access-control";
import { isPublicRoute, LOGOUT_ROUTE } from "@/lib/auth-routes";
import type { AccountRole } from "@/types";
import type { Route } from "next";

const INTERNAL_ORIGIN = "https://taco.internal";
const MAX_REDIRECT_LENGTH = 2048;
const MAX_POSTGRES_INTEGER = 2_147_483_647;
const UNSAFE_CHARACTER = /[\u0000-\u001f\u007f\\]/;
const CANONICAL_POSITIVE_INTEGER = /^[1-9]\d*$/;

export type InternalHref =
  | "/"
  | "/account"
  | "/account/security"
  | "/admin"
  | "/admin/approvals"
  | "/admin/courses"
  | `/admin/courses/${number}`
  | "/admin/events"
  | "/admin/instructors"
  | `/admin/instructors/${number}`
  | "/admin/roadmaps"
  | `/admin/roadmaps/${number}`
  | "/admin/users"
  | `/admin/users/${number}`
  | "/attendance"
  | `/attendance/instructor/${number}`
  | "/calendar"
  | "/counsel"
  | "/counsel/analytics"
  | "/counsel/new"
  | `/counsel/${number}`
  | "/expenses"
  | "/expenses/new"
  | `/expenses/${number}`
  | "/insights"
  | "/login"
  | "/logout"
  | "/payments"
  | "/payments/new"
  | `/payments/${number}`
  | "/payouts"
  | `/payouts/${number}`
  | `/payouts/detail/${number}`
  | "/recover"
  | "/reports"
  | "/reports/write"
  | `/reports/${number}`
  | "/reset-password"
  | "/schedule"
  | "/sessions"
  | `/sessions/${number}`
  | `/sessions/${number}/feedback/${number}`
  | "/signup"
  | "/students"
  | `/students/${number}`
  | "/timetable"
  | "/verify-email";

export function positiveRouteId(candidate: unknown): number | null {
  if (typeof candidate === "number") {
    return Number.isInteger(candidate) &&
      candidate >= 1 &&
      candidate <= MAX_POSTGRES_INTEGER
      ? candidate
      : null;
  }

  if (
    typeof candidate !== "string" ||
    !CANONICAL_POSITIVE_INTEGER.test(candidate)
  ) {
    return null;
  }

  const parsed = Number(candidate);
  return parsed <= MAX_POSTGRES_INTEGER ? parsed : null;
}

function routeIdSegment(candidate: unknown): number {
  const id = positiveRouteId(candidate);
  if (id == null) {
    throw new RangeError("Route id must be a positive PostgreSQL integer");
  }
  return id;
}

export const internalRoute = {
  adminCourse: (id: number): InternalHref =>
    `/admin/courses/${routeIdSegment(id)}`,
  adminInstructor: (id: number): InternalHref =>
    `/admin/instructors/${routeIdSegment(id)}`,
  adminRoadmap: (id: number): InternalHref =>
    `/admin/roadmaps/${routeIdSegment(id)}`,
  adminUser: (id: number): InternalHref =>
    `/admin/users/${routeIdSegment(id)}`,
  attendanceInstructor: (id: number): InternalHref =>
    `/attendance/instructor/${routeIdSegment(id)}`,
  counsel: (id: number): InternalHref => `/counsel/${routeIdSegment(id)}`,
  expense: (id: number): InternalHref => `/expenses/${routeIdSegment(id)}`,
  payment: (id: number): InternalHref => `/payments/${routeIdSegment(id)}`,
  payoutInstructor: (id: number): InternalHref =>
    `/payouts/${routeIdSegment(id)}`,
  payoutRecord: (id: number): InternalHref =>
    `/payouts/detail/${routeIdSegment(id)}`,
  report: (id: number): InternalHref => `/reports/${routeIdSegment(id)}`,
  session: (id: number): InternalHref => `/sessions/${routeIdSegment(id)}`,
  sessionFeedback: (sessionId: number, studentId: number): InternalHref =>
    `/sessions/${routeIdSegment(sessionId)}/feedback/${routeIdSegment(studentId)}`,
  student: (id: number): InternalHref => `/students/${routeIdSegment(id)}`,
} as const;

const APP_ROUTE_PREFIXES = [
  "/account",
  "/admin",
  "/attendance",
  "/calendar",
  "/counsel",
  "/expenses",
  "/insights",
  "/payments",
  "/payouts",
  "/reports",
  "/schedule",
  "/sessions",
  "/students",
  "/timetable",
] as const;

const RESTRICTED_ROUTE_POLICIES: ReadonlyArray<{
  prefix: string;
  capability: AppCapability;
}> = [
  { prefix: "/admin/approvals", capability: "approval.manage" },
  { prefix: "/admin", capability: "admin.area" },
  { prefix: "/counsel", capability: "counsel.manage" },
  { prefix: "/expenses", capability: "finance.access" },
  { prefix: "/insights", capability: "finance.access" },
  { prefix: "/payments", capability: "finance.access" },
];

const routeMatches = (pathname: string, prefix: string): boolean =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

function hasSafeDecodedPath(pathname: string): boolean {
  let decoded = pathname;
  for (let depth = 0; depth < 5; depth += 1) {
    if (
      !decoded.startsWith("/") ||
      decoded.startsWith("//") ||
      UNSAFE_CHARACTER.test(decoded)
    ) {
      return false;
    }
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return false;
    }
    if (next === decoded) return true;
    decoded = next;
  }
  return false;
}

function isKnownAppPath(pathname: string): boolean {
  return pathname === "/" || APP_ROUTE_PREFIXES.some((prefix) => routeMatches(pathname, prefix));
}

/**
 * Converts untrusted navigation input into a known same-origin application path.
 * Backend authorization remains the final permission boundary.
 */
export function safeInternalRedirect(
  candidate: string | null | undefined,
  fallback: Route,
): Route {
  if (
    !candidate ||
    candidate.length > MAX_REDIRECT_LENGTH ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    UNSAFE_CHARACTER.test(candidate)
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, INTERNAL_ORIGIN);
    if (
      parsed.origin !== INTERNAL_ORIGIN ||
      !hasSafeDecodedPath(parsed.pathname) ||
      !isKnownAppPath(parsed.pathname)
    ) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}` as Route;
  } catch {
    return fallback;
  }
}

export function defaultPostLoginLanding(role: AccountRole): Route {
  return hasCapability(role, "approval.manage") ? "/admin/approvals" : "/";
}

function canRoleOpenPath(pathname: string, role: AccountRole): boolean {
  if (isPublicRoute(pathname) || routeMatches(pathname, LOGOUT_ROUTE)) return false;
  const policy = RESTRICTED_ROUTE_POLICIES.find(({ prefix }) => routeMatches(pathname, prefix));
  return policy == null || hasCapability(role, policy.capability);
}

export function resolvePostLoginDestination(
  candidate: string | null | undefined,
  role: AccountRole,
  mustChangePassword: boolean,
): Route {
  if (mustChangePassword) return "/account/security";

  const fallback = defaultPostLoginLanding(role);
  const destination = safeInternalRedirect(candidate, fallback);
  const pathname = new URL(destination, INTERNAL_ORIGIN).pathname;
  return canRoleOpenPath(pathname, role) ? destination : fallback;
}
