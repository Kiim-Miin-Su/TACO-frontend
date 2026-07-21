import type { CounselForm, CounselFormSnapshot } from '@/types';

export const snapshotFromForm = (form: CounselForm): CounselFormSnapshot => ({
  studentId: form.studentId,
  assignedStaffId: form.assignedStaffId ?? null,
  status: form.status,
  source: form.source,
  submitterType: form.submitterType,
  referenceNotes: form.referenceNotes ?? null,
  nextContactAt: form.nextContactAt ?? null,
});
