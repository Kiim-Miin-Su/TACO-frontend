import type { CounselForm, CounselFormSnapshot } from '@/types';

export const snapshotFromForm = (form: CounselForm): CounselFormSnapshot => ({
  applicantName: form.applicantName,
  applicantPhone: form.applicantPhone ?? null,
  parentId: form.parentId ?? null,
  studentId: form.studentId ?? null,
  assignedStaffId: form.assignedStaffId ?? null,
  status: form.status,
  source: form.source,
  submitterType: form.submitterType,
  interestSubjectId: form.interestSubjectId ?? null,
  interestCourseId: form.interestCourseId ?? null,
  academyExpectation: form.academyExpectation ?? null,
  desiredStartTime: form.desiredStartTime ?? null,
  learningAtmosphere: form.learningAtmosphere ?? null,
  studentIntention: form.studentIntention ?? null,
  weakness: form.weakness ?? null,
  referenceNotes: form.referenceNotes ?? null,
  nextContactAt: form.nextContactAt ?? null,
});
