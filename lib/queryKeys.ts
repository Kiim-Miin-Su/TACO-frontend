// TanStack Query 키 레지스트리 — 매직 문자열 대신 한곳에서 관리(무효화 일관성).
// 예) queryClient.invalidateQueries({ queryKey: qk.schedule.all })
import type { ScheduleQuery } from "@/lib/api";
import type { AvailabilityOwner } from "@/types";

export const qk = {
  schedule: {
    all: ["schedule"] as const,
    list: (q: ScheduleQuery, scope = "global") => ["schedule", "list", scope, q] as const,
    resources: (scope = "global") => ["schedule", "resources", scope] as const,
  },
  availability: {
    all: ["availability"] as const,
    list: (ownerType: AvailabilityOwner, ownerId: number) => ["availability", ownerType, ownerId] as const,
    everything: (scope = "global") => ["availability", "all", scope] as const,
  },
  rooms: { all: () => ["rooms"] as const },
  scheduleRequests: { all: ["scheduleRequests"] as const, list: (scope = "global") => ["scheduleRequests", "list", scope] as const },
  payouts: {
    all: ["payouts"] as const,
    list: () => ["payouts", "list"] as const,
    mine: (scope = "global") => ["payouts", "mine", scope] as const,
    preview: (instructorId: number, from: string, to: string) => ["payouts", "preview", instructorId, from, to] as const,
    previewMine: (scope: string, from: string, to: string) => ["payouts", "previewMine", scope, from, to] as const,
  },
  reports: { all: ["reports"] as const, list: (sessionId?: number, scope = "global") => ["reports", "list", scope, sessionId ?? null] as const },
  students: { all: ["students"] as const, list: () => ["students", "list"] as const },
  payments: { all: ["payments"] as const, list: () => ["payments", "list"] as const },
  expenses: { all: ["expenses"] as const, list: () => ["expenses", "list"] as const },
  courses: { all: ["courses"] as const, list: () => ["courses", "list"] as const },
  subjects: { all: ["subjects"] as const, list: () => ["subjects", "list"] as const },
  enrollments: { all: ["enrollments"] as const, list: (studentId?: number) => ["enrollments", "list", studentId ?? null] as const },
  counsel: {
    all: ["counsel"] as const,
    forms: () => ["counsel", "forms"] as const,
    rounds: (counselFormId?: number) => ["counsel", "rounds", counselFormId ?? null] as const,
  },
  transactions: { all: ["transactions"] as const, list: () => ["transactions", "list"] as const },
  viewPresets: { all: ["viewPresets"] as const, list: () => ["viewPresets", "list"] as const },
  reportTemplates: { all: ["reportTemplates"] as const, list: () => ["reportTemplates", "list"] as const },
  events: { all: ["events"] as const, list: () => ["events", "list"] as const },
  attendance: { all: ["attendance"] as const, list: (scope = "global") => ["attendance", "list", scope] as const },
  roadmaps: {
    all: ["roadmaps"] as const,
    list: () => ["roadmaps", "list"] as const,
    courses: () => ["roadmaps", "courses"] as const,
  },
  parents: {
    all: ["parents"] as const,
    list: () => ["parents", "list"] as const,
    relations: () => ["parents", "relations"] as const,
  },
  users: { all: ["users"] as const, list: () => ["users", "list"] as const },
  profile: {
    all: ["profile"] as const,
    me: (scope = "global") => ["profile", "me", scope] as const,
  },
  profileChangeRequests: {
    all: ["profileChangeRequests"] as const,
    mine: (scope = "global") => ["profileChangeRequests", "mine", scope] as const,
    list: (scope = "global") => ["profileChangeRequests", "list", scope] as const,
    detail: (id: number, scope = "global") => ["profileChangeRequests", "detail", scope, id] as const,
  },
} as const;
