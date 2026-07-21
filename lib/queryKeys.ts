// TanStack Query 키 레지스트리 — 매직 문자열 대신 한곳에서 관리(무효화 일관성).
// 예) queryClient.invalidateQueries({ queryKey: qk.schedule.all })
import type { ScheduleQuery } from "@/lib/api";
import type { AvailabilityOwner } from "@/types";

export const qk = {
  auth: {
    pending: ["auth", "pending"] as const,
    // [TBO-31 C2 2026-07-16] 아이디 가용성 공개 체크(가입 폼 디바운스 라이브 체크)
    webIdAvailable: (webId: string) => ["auth", "web-id-available", webId] as const,
  },
  schedule: {
    all: ["schedule"] as const,
    list: (q: ScheduleQuery, scope = "global") => ["schedule", "list", scope, q] as const,
    resources: (scope = "global") => ["schedule", "resources", scope] as const,
    // [B7 E3] 상세 단건 — 루트("schedule") 하위라 기존 캘린더 명령 무효화가 자동 포함.
    detail: (id: number, scope = "global") => ["schedule", "detail", scope, id] as const,
  },
  availability: {
    all: ["availability"] as const,
    list: (ownerType: AvailabilityOwner, ownerId: number) => ["availability", ownerType, ownerId] as const,
    everything: (scope = "global") => ["availability", "all", scope] as const,
  },
  navSeen: { all: ["nav-seen"] as const }, // [B3] 알림 뱃지 읽음
  rooms: { all: () => ["rooms"] as const },
  scheduleRequests: { all: ["scheduleRequests"] as const, list: (scope = "global") => ["scheduleRequests", "list", scope] as const },
  payouts: {
    all: ["payouts"] as const,
    list: () => ["payouts", "list"] as const,
    mine: (scope = "global") => ["payouts", "mine", scope] as const,
    preview: (instructorId: number, from: string, to: string) => ["payouts", "preview", instructorId, from, to] as const,
    previewMine: (scope: string, from: string, to: string) => ["payouts", "previewMine", scope, from, to] as const,
    readiness: (scope = "global") => ["payouts", "readiness", scope] as const,
  },
  reports: { all: ["reports"] as const, list: (sessionId?: number, scope = "global") => ["reports", "list", scope, sessionId ?? null] as const },
  students: {
    all: ["students"] as const,
    list: () => ["students", "list"] as const,
    aggregate: (id: number) => ["students", "aggregate", id] as const,
  }, // [B7 E3]
  instructors: {
    all: ["instructors"] as const,
    list: () => ["instructors", "list"] as const,
    detail: (id: number) => ["instructors", "detail", id] as const,
  },
  payments: { all: ["payments"] as const, list: () => ["payments", "list"] as const, detail: (id: number) => ["payments", "detail", id] as const }, // [B7 E3]
  expenses: { all: ["expenses"] as const, list: () => ["expenses", "list"] as const, detail: (id: number) => ["expenses", "detail", id] as const }, // [B7 E3]
  courses: { all: ["courses"] as const, list: () => ["courses", "list"] as const, detail: (id: number) => ["courses", "detail", id] as const }, // [B7 E3]
  subjects: { all: ["subjects"] as const, list: () => ["subjects", "list"] as const },
  enrollments: { all: ["enrollments"] as const, list: (studentId?: number) => ["enrollments", "list", studentId ?? null] as const },
  counsel: {
    all: ["counsel"] as const,
    forms: (scope = "global") => ["counsel", "forms", scope] as const,
    form: (id: number, scope = "global") => ["counsel", "form", scope, id] as const, // [B7 E3] 상세 단건
    aggregate: (id: number, scope = "global") => ["counsel", "aggregate", scope, id] as const,
    rounds: (counselFormId?: number, scope = "global") => ["counsel", "rounds", scope, counselFormId ?? null] as const,
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
  users: {
    all: ["users"] as const,
    list: () => ["users", "list"] as const,
    // [TBO-31 C2/C3 2026-07-16] 대표 아이디 변경 중복 라이브 체크(STAFF 전용 /users/exists)
    exists: (webId: string) => ["users", "exists", webId] as const,
    detail: (id: number) => ["users", "detail", id] as const, // [유저 관리 07-20] 상세 단건(B7 규약)
  },
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
  // [E0.5 ④] 참조 데이터 카탈로그(국가·시간대) — 계정 무관 전역 캐시.
  catalog: {
    countries: () => ["catalog", "countries"] as const,
  },
} as const;
