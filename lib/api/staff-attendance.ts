import type {
  DeleteStaffAttendanceInput,
  InstructorAttendanceLedger,
  InstructorAttendanceLedgerQuery,
  StaffAttendanceQuery,
  StaffAttendanceRecord,
  UpsertStaffAttendanceInput,
} from "@kms545487/contracts";
import { http, type ApiReadOptions } from "./client";

export const staffAttendanceApi = {
  staffAttendance: {
    list: (query: StaffAttendanceQuery, options: ApiReadOptions = {}) =>
      http.get<StaffAttendanceRecord[]>("/staff-attendance", { params: query, ...options }).then((response) => response.data),
    ledger: (query: InstructorAttendanceLedgerQuery, options: ApiReadOptions = {}) =>
      http.get<InstructorAttendanceLedger>("/staff-attendance/instructor-ledger", { params: query, ...options }).then((response) => response.data),
    upsert: (input: UpsertStaffAttendanceInput) =>
      http.put<StaffAttendanceRecord>("/staff-attendance", input).then((response) => response.data),
    remove: (id: number, input: DeleteStaffAttendanceInput) =>
      http.delete<{ id: number; deleted: true }>(`/staff-attendance/${id}`, { data: input }).then((response) => response.data),
  },
};
