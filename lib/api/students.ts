// 학생·수강·보호자·상담 도메인 API — lib/api.ts에서 분할(순수 이동).
import { http } from "./client";
import type {
  Student,
  Enrollment,
  CounselForm,
  CounselFormSnapshot,
  CounselRound,
  CounselStatus,
  CounselResult,
  Parent,
  ParentStudent,
  CreateCounselInput,
  UpdateCounselInput,
  CreateCounselRoundInput,
  CreateStudentAggregateInput,
  UpdateStudentAggregateInput,
  StudentAggregate,
  StudentFamilyRelation,
  StudentAcademicHistory,
  CreateStudentFamilyRelationInput,
  UpdateStudentFamilyRelationInput,
  CreateStudentAcademicHistoryInput,
  UpdateStudentAcademicHistoryInput,
  CounselAggregate,
  UpdateCounselRoundInput,
  CreateParentInput,
  LinkParentInput,
  CreateEnrollmentInput,
  UpdateEnrollmentInput,
  CreateStudentCounselIntakeInput,
} from "@kms545487/contracts";

export type InternalCreateCounselInput =
  Omit<CreateCounselInput, "source" | "submitterType" | "assignedStaffId">;
export type InternalUpdateCounselInput =
  Omit<UpdateCounselInput, "source" | "submitterType" | "assignedStaffId">;
type CounselFormCommandSnapshot = Pick<
  CounselFormSnapshot,
  "studentId" | "status" | "referenceNotes" | "nextContactAt"
>;
export type InternalCreateCounselRoundInput =
  Omit<CreateCounselRoundInput, "counselorId" | "formSnapshot"> & {
    formSnapshot?: CounselFormCommandSnapshot;
  };
export type InternalUpdateCounselRoundInput =
  Omit<UpdateCounselRoundInput, "counselorId" | "formSnapshot"> & {
    formSnapshot?: CounselFormCommandSnapshot;
  };

// [TBO-30G 2026-07-23 대표 지시] 가족(형제·자매) 테이블 조인 단일 진실원 — BE student-family.types.ts 미러.
//  관계→학생→보호자→수강→상담 서버 조인 파생(읽기 전용·사본 0). 학생 상세·상담 화면이 이 하나만 소비.
export type StudentFamilyMemberCounsel = Pick<CounselForm, "id" | "status" | "source" | "createdAt"> & {
  nextContactAt: string | null;
};
export type StudentFamilyMember = {
  relationId: number;
  relationType: StudentFamilyRelation["relationType"];
  relationLabel: string | null;
  student: Student;
  guardians: Array<{ parent: Parent; relation: ParentStudent }>;
  activeEnrollmentCount: number;
  counselForms: StudentFamilyMemberCounsel[];
  sharedGuardianParentIds: number[];
};
export type StudentFamilyAggregate = { studentId: number; members: StudentFamilyMember[] };

// [TBO-30D/30E 2026-07-23] 상담 퍼널·상관관계 — BE counsel-analytics.ts(순수 함수 단일 진실원) 응답 미러.
export type CounselFunnel = {
  range: { from: string | null; to: string | null };
  total: number;
  statusCounts: Record<CounselStatus, number>;
  roundReach: Array<{ minRounds: number; count: number }>;
  dropAfterRounds: Array<{ rounds: number; count: number }>;
  resultDistribution: Record<CounselResult, number>;
  conversionRate: number;
  dropRate: number;
  avgRoundsToConversion: number | null;
  avgDaysToConversion: number | null;
};
export type CounselCorrelationRow = {
  interestKey: string;
  counselCount: number;
  convertedCount: number;
  conversionRate: number;
  enrolledBySubject: Array<{ subject: string; count: number }>;
};
export type CounselCorrelation = {
  range: { from: string | null; to: string | null };
  totalForms: number;
  rows: CounselCorrelationRow[];
  enrolledSubjects: string[];
};
export type CounselAnalyticsRange = { from?: string | null; to?: string | null };

export const studentsApi = {
  students: {
    list: (includeInactive = false) =>
      http.get<Student[]>("/students", {
        params: includeInactive ? { includeInactive: "true" } : undefined,
      }).then((r) => r.data),
    aggregate: (id: number) => http.get<StudentAggregate>(`/students/${id}/aggregate`).then((r) => r.data),
    // [TBO-35 35C] 호환 URL도 동일 aggregate command를 소비한다.
    register: (body: CreateStudentAggregateInput) =>
      http.post<{
        student: Student;
        guardian: { parent: Parent; relation: ParentStudent; linkedExisting: boolean } | null;
        guardians: Array<{ parent: Parent; relation: ParentStudent; linkedExisting: boolean }>;
        enrollment: Enrollment | null;
      }>("/students/registrations", body).then((r) => r.data),
    registerWithCounsel: (body: CreateStudentCounselIntakeInput) =>
      http.post<{
        registration: {
          student: Student;
          guardian: { parent: Parent; relation: ParentStudent; linkedExisting: boolean } | null;
          guardians: Array<{ parent: Parent; relation: ParentStudent; linkedExisting: boolean }>;
          enrollment: Enrollment | null;
        };
        counsel: CounselForm;
        correlationId: string;
      }>("/students/registrations/with-counsel", body).then((r) => r.data),
    // [피드백 2026-07-03] 캘린더 우측 패널 학생 정보 수정(출국/입국·상태 변경) — PATCH 부분 갱신.
    update: (id: number, patch: Partial<Pick<Student, "name" | "englishName" | "gender" | "birthDate" | "grade" | "phone" | "country" | "residenceType" | "address" | "addressDetail" | "kakaoId" | "counselTopic" | "schoolName" | "status" | "memo">>) =>
      http.patch<Student>(`/students/${id}`, patch).then((r) => r.data),
    updateAggregate: (id: number, patch: UpdateStudentAggregateInput) =>
      http.patch<StudentAggregate>(`/students/${id}/aggregate`, patch).then((r) => r.data),
    // [TBO-30G] linkGuardians=true면 같은 tx에서 두 학생 보호자를 관계 행으로 합집합 연결(사본 0)
    createFamilyRelation: (studentId: number, input: CreateStudentFamilyRelationInput & { linkGuardians?: boolean }) =>
      http.post<StudentFamilyRelation>(`/students/${studentId}/family-relations`, input).then((r) => r.data),
    updateFamilyRelation: (studentId: number, relationId: number, input: UpdateStudentFamilyRelationInput) =>
      http.patch<StudentFamilyRelation>(`/students/${studentId}/family-relations/${relationId}`, input).then((r) => r.data),
    removeFamilyRelation: (studentId: number, relationId: number) =>
      http.delete<{ id: number; deleted: true }>(`/students/${studentId}/family-relations/${relationId}`).then((r) => r.data),
    // [TBO-30G] 가족 조인 단일 진실원 — 서버 조인 파생 aggregate(학생 상세·상담 화면 공용)
    family: (studentId: number) =>
      http.get<StudentFamilyAggregate>(`/students/${studentId}/family`).then((r) => r.data),
    createAcademicHistory: (studentId: number, input: Omit<CreateStudentAcademicHistoryInput, "studentId">) =>
      http.post<StudentAcademicHistory>(`/students/${studentId}/academic-histories`, input).then((r) => r.data),
    updateAcademicHistory: (studentId: number, historyId: number, input: UpdateStudentAcademicHistoryInput) =>
      http.patch<StudentAcademicHistory>(`/students/${studentId}/academic-histories/${historyId}`, input).then((r) => r.data),
    removeAcademicHistory: (studentId: number, historyId: number) =>
      http.delete<{ id: number; deleted: true }>(`/students/${studentId}/academic-histories/${historyId}`).then((r) => r.data),
    remove: (id: number) => http.delete<Student>(`/students/${id}`).then((r) => r.data),
  },
  enrollments: {
    list: (studentId?: number) =>
      http.get<Enrollment[]>("/enrollments", { params: studentId ? { studentId } : undefined }).then((r) => r.data),
    create: (body: CreateEnrollmentInput) => http.post<Enrollment>("/enrollments", body).then((r) => r.data),
    update: (id: number, patch: UpdateEnrollmentInput) =>
      http.patch<Enrollment>(`/enrollments/${id}`, patch).then((r) => r.data),
  },
  counsel: {
    forms: () => http.get<CounselForm[]>("/counsel").then((r) => r.data),
    get: (id: number) => http.get<CounselForm>(`/counsel/${id}`).then((r) => r.data), // [B7 E3] 상세 단건(BE 신설)
    aggregate: (id: number) => http.get<CounselAggregate>(`/counsel/${id}/aggregate`).then((r) => r.data),
    // [TBO-30D/30E] 집계는 서버 순수 함수 파생(전 목록 클라 계산 금지 — TBO-30 불변식 5)
    funnel: (range: CounselAnalyticsRange = {}) =>
      http.get<CounselFunnel>("/counsel/analytics/funnel", { params: { ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) } }).then((r) => r.data),
    correlation: (range: CounselAnalyticsRange = {}) =>
      http.get<CounselCorrelation>("/counsel/analytics/correlation", { params: { ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) } }).then((r) => r.data),
    rounds: (counselFormId?: number) =>
      http.get<CounselRound[]>("/counsel/rounds", { params: counselFormId ? { counselFormId } : undefined }).then((r) => r.data),
    create: (input: InternalCreateCounselInput) => http.post<CounselForm>("/counsel", input).then((r) => r.data),
    update: (id: number, patch: InternalUpdateCounselInput) => http.patch<CounselForm>(`/counsel/${id}`, patch).then((r) => r.data),
    remove: (id: number) => http.delete<CounselForm>(`/counsel/${id}`).then((r) => r.data),
    createRound: (formId: number, input: InternalCreateCounselRoundInput) =>
      http.post<CounselRound>(`/counsel/${formId}/rounds`, input).then((r) => r.data),
    updateRound: (formId: number, roundId: number, input: InternalUpdateCounselRoundInput) =>
      http.patch<CounselRound>(`/counsel/${formId}/rounds/${roundId}`, input).then((r) => r.data),
    removeRound: (formId: number, roundId: number) =>
      http.delete<{ id: number; deleted: true }>(`/counsel/${formId}/rounds/${roundId}`).then((r) => r.data),
  },
  parents: {
    list: () => http.get<Parent[]>("/parents").then((r) => r.data),
    relations: () => http.get<ParentStudent[]>("/parents/relations").then((r) => r.data),
    create: (input: CreateParentInput) =>
      http.post<{ parent: Parent; relation: ParentStudent }>("/parents", input).then((r) => r.data),
    link: (input: LinkParentInput) =>
      http.post<ParentStudent>("/parents/link", input).then((r) => r.data),
    update: (id: number, input: { name?: string; phone?: string; kakaoAvailable?: boolean }) =>
      http.patch<Parent>(`/parents/${id}`, input).then((r) => r.data),
    updateRelation: (id: number, input: { relation?: string; isPayer?: boolean; isPrimary?: boolean }) =>
      http.patch<ParentStudent>(`/parents/relations/${id}`, input).then((r) => r.data),
    removeGuardian: (id: number) =>
      http.delete<{ relationId: number; parentId: number; parentDeleted: boolean }>(`/parents/relations/${id}/guardian`).then((r) => r.data),
  },
};
