// [2026-07-26 구조 분할] 도메인 모듈(lib/api/*) 합성 배럴 — 소비처 import 경로(@/lib/api)와 export 표면을 그대로 유지한다.
import { authAccountApi } from "./api/auth-account";
import { studentsApi } from "./api/students";
import { scheduleApi } from "./api/schedule";
import { academicsApi } from "./api/academics";
import { financeApi } from "./api/finance";
import { miscApi } from "./api/misc";

// [TBO-34 C1] 인증은 backend-set HttpOnly cookie 단일 소스. Bearer 조립/토큰 decode를 금지한다.
export const api = {
  ...miscApi,
  ...authAccountApi,
  ...studentsApi,
  ...financeApi,
  ...academicsApi,
  ...scheduleApi,
};

export type { ApiReadOptions } from "./api/client";
export type {
  LoginBody,
  LoginResult,
  ChangeCredentialsBody,
  SignupBody,
  SignupResult,
  SignupEmailChallenge,
  OtpChallenge,
  SignupConfig,
  PendingAccount,
  MyProfile,
  ProfileChangeFields,
  CatalogCountry,
  ProfileChangeRequest,
  CreateProfileChangeRequestBody,
  ProfileVerificationChannel,
  ProfileVerification,
  CreateProfileVerificationBody,
  UserProfileSummary,
} from "./api/auth-account";
export type {
  StudentFamilyMemberCounsel,
  StudentFamilyMember,
  StudentFamilyAggregate,
  CounselFunnel,
  CounselCorrelationRow,
  CounselCorrelation,
  CounselAnalyticsRange,
} from "./api/students";
export type {
  ScheduleQuery,
  AvailabilityKindEx,
  ScheduleRequestEx,
  CreateScheduleRequestBody,
  CreateScheduleRequestBulkBody,
  UpdateScheduleRequestBody,
  ScheduleCreateBody,
  ScheduleSeriesCreateBody,
  ScheduleSeriesInfo,
  AvailabilityUpsertBody,
  SchedulePatchBody,
  InstructorAttendanceSummary,
  ConflictCheckBody,
} from "./api/schedule";
export type {
  RoadmapAggregate,
  CreateRoadmapBody,
  UpdateRoadmapInput,
  InstructorContract,
} from "./api/academics";
export type {
  SessionReport,
  PayoutLine,
  MeasureResult,
  PayoutRowStatus,
  RevenueKeyAmount,
  RevenueReport,
  FinanceSummary,
  UncoveredPayoutEntry,
  BulkGenerateResult,
  PayoutRow,
  LedgerTx,
  WorksheetPricing,
  PayoutWorksheetRow,
  PayoutWorksheet,
  CeoDashboard,
} from "./api/finance";
