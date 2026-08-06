'use client';

import { useMemo, useState } from 'react';
import type { InstructorAttendanceStatus } from '@kms545487/contracts';
import { Field, ModalShell } from '@/components/ui';
import { apiErrorMessage } from '@/lib/api-error';
import { buildInstructorAttendanceCorrectionRequestBody } from '@/lib/domain/request-drafts';
import { useCreateScheduleRequest, useScheduleRequests } from '@/lib/queries';
import { INSTRUCTOR_ATT_OPTIONS } from './AttMarker';

const attendanceLabel = (value?: InstructorAttendanceStatus | null): string =>
  INSTRUCTOR_ATT_OPTIONS.find((option) => option.value === value)?.label ?? '미선택';

export function InstructorAttendanceCorrectionModal({
  session,
  onClose,
}: {
  session: {
    id: number;
    sessionDate: string;
    startTime?: string | null;
    courseName?: string | null;
    instructorAttendance?: InstructorAttendanceStatus | null;
  };
  onClose: () => void;
}) {
  const createRequest = useCreateScheduleRequest();
  const { data: requests = [] } = useScheduleRequests();
  const [requested, setRequested] = useState<InstructorAttendanceStatus | ''>('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const pending = useMemo(
    () => requests.find((request) => request.requestKind === 'instructor_attendance_correction'
      && request.targetSessionId === session.id && request.status === 'pending'),
    [requests, session.id],
  );
  const valid = requested !== ''
    && requested !== session.instructorAttendance
    && reason.trim().length >= 2
    && reason.trim().length <= 500;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || createRequest.isPending || pending) return;
    setError(null);
    createRequest.mutate(
      buildInstructorAttendanceCorrectionRequestBody(session.id, requested, reason),
      {
        onSuccess: ({ row }) => setCreatedId(row.id),
        onError: (caught) => setError(apiErrorMessage(caught, '출결 정정 요청을 보내지 못했습니다.')),
      },
    );
  };

  return (
    <ModalShell title="강사 출결 정정 요청" onClose={onClose}>
      <form onSubmit={submit} className="p-4 space-y-4">
        <div className="rounded-md border p-3 text-body space-y-1">
          <div className="font-medium">{session.courseName ?? '수업'}</div>
          <div className="mono text-fg-muted">{session.sessionDate} {session.startTime ?? ''}</div>
          <div className="text-fg-muted">현재 출결: <b className="text-fg">{attendanceLabel(session.instructorAttendance)}</b></div>
        </div>

        {createdId != null || pending ? (
          <div className="rounded-md border border-success bg-success-subtle p-3 text-body" role="status">
            정정 요청 #{createdId ?? pending?.id}을 보냈습니다. 승인센터 처리 결과는 대시보드와 출석부에서 확인할 수 있습니다.
          </div>
        ) : (
          <>
            <Field label="요청 출결 *">
              <select
                className="input"
                value={requested}
                onChange={(event) => setRequested(event.target.value as InstructorAttendanceStatus | '')}
              >
                <option value="">선택</option>
                {INSTRUCTOR_ATT_OPTIONS.filter((option) => option.value !== session.instructorAttendance).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
            <Field label="정정 사유 *">
              <textarea
                className="input min-h-24 resize-y"
                minLength={2}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="실제 출결과 다른 이유를 입력하세요."
              />
            </Field>
            <div className="text-caption text-fg-subtle text-right">{reason.trim().length}/500</div>
            {error && <div className="text-caption text-danger" role="alert">{error}</div>}
          </>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>닫기</button>
          {createdId == null && !pending && (
            <button type="submit" className="btn btn-primary" disabled={!valid || createRequest.isPending}>
              {createRequest.isPending ? '요청 중...' : '승인 요청'}
            </button>
          )}
        </div>
      </form>
    </ModalShell>
  );
}
