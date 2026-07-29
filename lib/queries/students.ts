"use client";
// 학생·보호자·수강·상담 도메인 훅 — lib/queries.ts에서 분할(순수 이동).
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import {
  invalidateStudentAggregate,
  acceptStudentAggregateFromDatabase,
  acceptStudentFromDatabase,
  optimisticallyPatchStudent,
  optimisticallyRemoveStudent,
  reconcileStudentCommand,
  rollbackStudentCache,
  invalidateEnrollmentCommand,
} from "@/lib/query-cache";
import { useAccountAccess } from "@/lib/useAccountAccess";
import { CATALOG_STALE, detailRetry, useInvalidator } from "./shared";

export const useStudents = (includeInactive = false) =>
  useQuery({
    queryKey: qk.students.list(includeInactive),
    queryFn: () => api.students.list(includeInactive),
    staleTime: CATALOG_STALE,
  });
// [TBO-59 C3 · P0-5] 보호자 연락처 = 관리자 전용 API — 강사 계정에선 조회 자체를 막아 403 소음 제거.
export const useParents = () => {
  const { can } = useAccountAccess();
  return useQuery({ queryKey: qk.parents.list(), queryFn: () => api.parents.list(), staleTime: CATALOG_STALE, enabled: can("admin.area") });
};
export const useParentStudents = () => {
  const { can } = useAccountAccess();
  return useQuery({ queryKey: qk.parents.relations(), queryFn: () => api.parents.relations(), staleTime: CATALOG_STALE, enabled: can("admin.area") });
};
export const useEnrollments = (studentId?: number) =>
  useQuery({
    queryKey: qk.enrollments.list(studentId),
    queryFn: () => api.enrollments.list(studentId),
    staleTime: CATALOG_STALE,
  });
export const useCreateEnrollment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.enrollments.create,
    onSuccess: () => invalidateEnrollmentCommand(queryClient),
  });
};
export const useUpdateEnrollment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: { id: number; patch: Parameters<typeof api.enrollments.update>[1] }) =>
      api.enrollments.update(value.id, value.patch),
    onSuccess: () => invalidateEnrollmentCommand(queryClient),
  });
};

export const useCounselForms = () => {
  const { scope, can } = useAccountAccess();
  return useQuery({ queryKey: qk.counsel.forms(scope), queryFn: () => api.counsel.forms(), enabled: can("counsel.manage") });
};
export const useCounselRounds = () => {
  const { scope, can } = useAccountAccess();
  return useQuery({ queryKey: qk.counsel.rounds(undefined, scope), queryFn: () => api.counsel.rounds(), enabled: can("counsel.manage") });
};
// [TBO-30D/30E] 상담 분석 — 서버 순수 함수 파생만 소비(전 목록 클라 계산 금지). counsel prefix 키라
//  상담 쓰기의 기존 무효화(counsel.all)에 자동 포함된다.
export const useCounselFunnel = (range: { from?: string | null; to?: string | null } = {}) => {
  const { can } = useAccountAccess();
  return useQuery({
    queryKey: qk.counsel.funnel(range.from, range.to),
    queryFn: () => api.counsel.funnel(range),
    enabled: can("counsel.manage"),
  });
};
export const useCounselCorrelation = (range: { from?: string | null; to?: string | null } = {}) => {
  const { can } = useAccountAccess();
  return useQuery({
    queryKey: qk.counsel.correlation(range.from, range.to),
    queryFn: () => api.counsel.correlation(range),
    enabled: can("counsel.manage"),
  });
};

export const useStudentAggregate = (id: number | null) =>
  useQuery({ queryKey: qk.students.aggregate(id ?? 0), queryFn: () => api.students.aggregate(id as number), enabled: id != null, retry: detailRetry });
// [TBO-30G] 가족 조인 단일 진실원 — 학생 상세·상담 상세·상담 접수가 이 훅 하나만 소비(매니저 이상 API).
export const useStudentFamily = (id: number | null) => {
  const { can } = useAccountAccess();
  return useQuery({
    queryKey: qk.students.family(id ?? 0),
    queryFn: () => api.students.family(id as number),
    enabled: id != null && can("admin.area"),
    retry: detailRetry,
  });
};
export const useCounselAggregate = (id: number | null) => {
  const { scope, can } = useAccountAccess();
  return useQuery({
    queryKey: qk.counsel.aggregate(id ?? 0, scope),
    queryFn: () => api.counsel.aggregate(id as number),
    enabled: can("counsel.manage") && id != null,
    retry: detailRetry,
  });
};

// 명단(학생·수강)
// [TBO-35 35A] 학생 aggregate가 바뀌면 캘린더 resource 읽기모델까지 같은 helper로 갱신한다.
function useStudentAggregateMutationInvalidator() {
  const qc = useQueryClient();
  return () => invalidateStudentAggregate(qc);
}
export const useRegisterStudent = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["students", "register"],
    mutationFn: api.students.register,
    // 생성 중에는 폼 자체가 명확한 pending UI를 제공한다. 서버가 INSERT transaction을 확정한 뒤에만
    // 반환된 DB row를 cache에 넣고, 곧바로 DB 목록을 재조회한다(가짜 학생 id 생성 금지).
    onSuccess: (result) => acceptStudentFromDatabase(queryClient, result.student),
    onSettled: (result) => reconcileStudentCommand(queryClient, { studentId: result?.student.id }),
  });
};
export const useCreateStudentCounselIntake = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["students", "register-with-counsel"],
    mutationFn: api.students.registerWithCounsel,
    onSuccess: async (result) => {
      acceptStudentFromDatabase(queryClient, result.registration.student);
      await reconcileStudentCommand(queryClient, { studentId: result.registration.student.id });
    },
  });
};
export const useUpdateStudent = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: { id: number; patch: Parameters<typeof api.students.update>[1] }) =>
      api.students.update(value.id, value.patch),
    onMutate: (value) => optimisticallyPatchStudent(queryClient, value.id, value.patch),
    onError: (_error, value, snapshot) => rollbackStudentCache(queryClient, value.id, snapshot),
    onSuccess: (student) => acceptStudentFromDatabase(queryClient, student),
    onSettled: (_student, _error, value) => reconcileStudentCommand(queryClient, { studentId: value.id }),
  });
};
export const useUpdateStudentAggregate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: { id: number; patch: Parameters<typeof api.students.updateAggregate>[1] }) =>
      api.students.updateAggregate(value.id, value.patch),
    onMutate: (value) => optimisticallyPatchStudent(queryClient, value.id, value.patch.student ?? {}),
    onError: (_error, value, snapshot) => rollbackStudentCache(queryClient, value.id, snapshot),
    onSuccess: (aggregate) => acceptStudentAggregateFromDatabase(queryClient, aggregate),
    onSettled: (_aggregate, _error, value) => reconcileStudentCommand(queryClient, { studentId: value.id }),
  });
};
export const useRemoveStudent = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.students.remove,
    onMutate: (studentId) => optimisticallyRemoveStudent(queryClient, studentId),
    onError: (_error, studentId, snapshot) => rollbackStudentCache(queryClient, studentId, snapshot),
    onSettled: (_student, error, studentId) => reconcileStudentCommand(queryClient, {
      studentId,
      deleted: error == null,
    }),
  });
};
export const useCreateStudentFamilyRelation = () => useMutation({
  mutationFn: (value: { studentId: number; input: Parameters<typeof api.students.createFamilyRelation>[1] }) =>
    api.students.createFamilyRelation(value.studentId, value.input),
  onSuccess: useStudentAggregateMutationInvalidator(),
});
export const useUpdateStudentFamilyRelation = () => useMutation({
  mutationFn: (value: { studentId: number; relationId: number; input: Parameters<typeof api.students.updateFamilyRelation>[2] }) =>
    api.students.updateFamilyRelation(value.studentId, value.relationId, value.input),
  onSuccess: useStudentAggregateMutationInvalidator(),
});
export const useRemoveStudentFamilyRelation = () => useMutation({
  mutationFn: (value: { studentId: number; relationId: number }) => api.students.removeFamilyRelation(value.studentId, value.relationId),
  onSuccess: useStudentAggregateMutationInvalidator(),
});
export const useCreateStudentAcademicHistory = () => useMutation({
  mutationFn: (value: { studentId: number; input: Parameters<typeof api.students.createAcademicHistory>[1] }) =>
    api.students.createAcademicHistory(value.studentId, value.input),
  onSuccess: useStudentAggregateMutationInvalidator(),
});
export const useUpdateStudentAcademicHistory = () => useMutation({
  mutationFn: (value: { studentId: number; historyId: number; input: Parameters<typeof api.students.updateAcademicHistory>[2] }) =>
    api.students.updateAcademicHistory(value.studentId, value.historyId, value.input),
  onSuccess: useStudentAggregateMutationInvalidator(),
});
export const useRemoveStudentAcademicHistory = () => useMutation({
  mutationFn: (value: { studentId: number; historyId: number }) => api.students.removeAcademicHistory(value.studentId, value.historyId),
  onSuccess: useStudentAggregateMutationInvalidator(),
});
export const useCreateParent = () => useMutation({ mutationFn: api.parents.create, onSuccess: useStudentAggregateMutationInvalidator() });
export const useLinkParent = () => useMutation({ mutationFn: api.parents.link, onSuccess: useStudentAggregateMutationInvalidator() });
export const useUpdateParent = () => useMutation({
  mutationFn: (v: { id: number; patch: Parameters<typeof api.parents.update>[1] }) => api.parents.update(v.id, v.patch),
  onSuccess: useStudentAggregateMutationInvalidator(),
});
export const useUpdateParentRelation = () => useMutation({
  mutationFn: (v: { id: number; patch: Parameters<typeof api.parents.updateRelation>[1] }) => api.parents.updateRelation(v.id, v.patch),
  onSuccess: useStudentAggregateMutationInvalidator(),
});
export const useRemoveGuardian = () => useMutation({ mutationFn: api.parents.removeGuardian, onSuccess: useStudentAggregateMutationInvalidator() });

// 상담
const useCounselMutationInvalidator = () => useInvalidator([qk.counsel.all, qk.students.all]);

export const useCreateCounsel = () => useMutation({ mutationFn: api.counsel.create, onSuccess: useCounselMutationInvalidator() });
export const useUpdateCounsel = () =>
  useMutation({ mutationFn: (v: { id: number; patch: Parameters<typeof api.counsel.update>[1] }) => api.counsel.update(v.id, v.patch), onSuccess: useCounselMutationInvalidator() });
export const useRemoveCounsel = () =>
  useMutation({ mutationFn: api.counsel.remove, onSuccess: useCounselMutationInvalidator() });
export const useCreateCounselRound = () =>
  useMutation({ mutationFn: (v: { formId: number; input: Parameters<typeof api.counsel.createRound>[1] }) => api.counsel.createRound(v.formId, v.input), onSuccess: useCounselMutationInvalidator() });
export const useUpdateCounselRound = () =>
  useMutation({ mutationFn: (v: { formId: number; roundId: number; input: Parameters<typeof api.counsel.updateRound>[2] }) => api.counsel.updateRound(v.formId, v.roundId, v.input), onSuccess: useCounselMutationInvalidator() });
export const useRemoveCounselRound = () =>
  useMutation({ mutationFn: (v: { formId: number; roundId: number }) => api.counsel.removeRound(v.formId, v.roundId), onSuccess: useCounselMutationInvalidator() });
