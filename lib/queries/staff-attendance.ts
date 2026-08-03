"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InstructorAttendanceLedgerQuery, StaffAttendanceQuery } from "@kms545487/contracts";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import { useAccountAccess } from "@/lib/useAccountAccess";

export function useStaffAttendance(query: StaffAttendanceQuery) {
  const { can, scope } = useAccountAccess();
  return useQuery({
    queryKey: qk.staffAttendance.list(query, scope),
    queryFn: ({ signal }) => api.staffAttendance.list(query, { signal }),
    enabled: can("admin.area") && !!query.from && !!query.to,
  });
}

export function useInstructorAttendanceLedger(query: InstructorAttendanceLedgerQuery) {
  const { can, scope } = useAccountAccess();
  return useQuery({
    queryKey: qk.staffAttendance.ledger(query, scope),
    queryFn: ({ signal }) => api.staffAttendance.ledger(query, { signal }),
    enabled: can("admin.area") && !!query.from && !!query.to,
  });
}

function useStaffAttendanceInvalidator() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.staffAttendance.all }),
      queryClient.invalidateQueries({ queryKey: qk.audit.all }),
    ]);
  };
}

export function useUpsertStaffAttendance() {
  return useMutation({ mutationFn: api.staffAttendance.upsert, onSuccess: useStaffAttendanceInvalidator() });
}

export function useRemoveStaffAttendance() {
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => api.staffAttendance.remove(id, { reason }),
    onSuccess: useStaffAttendanceInvalidator(),
  });
}
