"use client";

import { useState } from "react";
import { Badge, EmptyState, ModalShell, SectionCard, TableWrap } from "@/components/ui";
import { ReasonModal } from "@/components/ReasonModal";
import type { ProfileChangeRequest, UserProfileSummary } from "@/lib/api";
import {
  formatProfileDate,
  PROFILE_STATUS_LABEL,
  PROFILE_STATUS_TONE,
  profileRequestDiff,
  profileRequestedSummary,
} from "@/lib/domain/profile";
import {
  useApproveProfileChangeRequest,
  useProfileChangeRequest,
  useRejectProfileChangeRequest,
} from "@/lib/queries";

function errorMessage(caught: unknown, fallback: string) {
  const error = caught as { response?: { data?: { message?: string | string[] } } };
  const message = error.response?.data?.message;
  return Array.isArray(message) ? message.join(" ") : message ?? fallback;
}

function ProfileRequestDetailModal({
  initial,
  users,
  onClose,
  onReject,
}: {
  initial: ProfileChangeRequest;
  users: UserProfileSummary[];
  onClose: () => void;
  onReject: (request: ProfileChangeRequest) => void;
}) {
  const detailQuery = useProfileChangeRequest(initial.id);
  const approve = useApproveProfileChangeRequest();
  const [error, setError] = useState<string | null>(null);
  const request = detailQuery.data ?? initial;
  const requester = users.find((user) => user.id === request.requesterId);
  const decider = users.find((user) => user.id === request.decidedBy);
  const diffs = profileRequestDiff(request, requester);
  const pending = request.status === "pending";

  const approveRequest = () => {
    setError(null);
    approve.mutate(request.id, {
      onSuccess: onClose,
      onError: (caught) => setError(errorMessage(caught, "프로필 변경 요청을 승인하지 못했습니다.")),
    });
  };

  return (
    <ModalShell
      title={`프로필 변경 요청 #${request.id}`}
      size="lg"
      onClose={onClose}
      footer={pending ? (
        <>
          <button className="btn btn-sm" onClick={onClose} disabled={approve.isPending}>닫기</button>
          <button className="btn btn-sm btn-danger" onClick={() => onReject(request)} disabled={approve.isPending}>반려</button>
          <button className="btn btn-sm btn-primary" onClick={approveRequest} disabled={approve.isPending}>
            {approve.isPending ? "처리 중..." : "승인"}
          </button>
        </>
      ) : <button className="btn btn-sm" onClick={onClose}>닫기</button>}
    >
      <div className="space-y-4">
        {detailQuery.isPending && <p className="text-caption text-fg-muted">최신 요청 정보를 확인하는 중...</p>}
        {detailQuery.isError && <p className="text-caption text-danger" role="alert">최신 상세를 불러오지 못해 목록 정보를 표시합니다.</p>}
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-body">
          <div><dt className="text-caption text-fg-subtle">신청자</dt><dd className="mt-0.5 font-medium">{requester?.name ?? `사용자 #${request.requesterId}`}</dd></div>
          <div><dt className="text-caption text-fg-subtle">상태</dt><dd className="mt-0.5"><Badge tone={PROFILE_STATUS_TONE[request.status]}>{PROFILE_STATUS_LABEL[request.status]}</Badge></dd></div>
          <div><dt className="text-caption text-fg-subtle">요청 시각</dt><dd className="mt-0.5 mono text-fg-muted">{formatProfileDate(request.createdAt)}</dd></div>
          <div><dt className="text-caption text-fg-subtle">수정 시각</dt><dd className="mt-0.5 mono text-fg-muted">{formatProfileDate(request.updatedAt)}</dd></div>
          <div><dt className="text-caption text-fg-subtle">기준 프로필</dt><dd className="mt-0.5">v{request.baseProfileVersion}</dd></div>
          <div><dt className="text-caption text-fg-subtle">현재 프로필</dt><dd className="mt-0.5">{requester?.profileVersion != null ? `v${requester.profileVersion}` : "버전 확인 불가"}</dd></div>
          <div className="sm:col-span-2"><dt className="text-caption text-fg-subtle">변경 사유</dt><dd className="mt-0.5 whitespace-pre-wrap break-words">{request.reason}</dd></div>
        </dl>

        <div>
          <h3 className="text-section font-semibold mb-2">변경 내용</h3>
          <TableWrap minWidth={520}>
            <table className="table">
              <thead><tr><th>항목</th><th>요청 당시</th><th>요청</th></tr></thead>
              <tbody>
                {diffs.map((row) => (
                  <tr key={row.field}>
                    <td className="font-medium">{row.label}</td>
                    <td className="text-fg-muted break-all">{row.current}</td>
                    <td className="text-accent break-all">{row.requested}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>

        {request.status !== "pending" && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 border-t pt-3 text-body">
            <div><dt className="text-caption text-fg-subtle">처리자</dt><dd className="mt-0.5">{decider?.name ?? (request.decidedBy ? `사용자 #${request.decidedBy}` : "—")}</dd></div>
            <div><dt className="text-caption text-fg-subtle">처리 시각</dt><dd className="mt-0.5 mono text-fg-muted">{formatProfileDate(request.decidedAt)}</dd></div>
            {request.rejectionReason && <div className="sm:col-span-2"><dt className="text-caption text-fg-subtle">반려 사유</dt><dd className="mt-0.5 text-danger whitespace-pre-wrap break-words">{request.rejectionReason}</dd></div>}
          </dl>
        )}
        {error && <p className="text-body text-danger" role="alert">{error}</p>}
      </div>
    </ModalShell>
  );
}

export function ProfileChangeRequestsSection({ requests, users }: { requests: ProfileChangeRequest[]; users: UserProfileSummary[] }) {
  const [selected, setSelected] = useState<ProfileChangeRequest | null>(null);
  const [rejecting, setRejecting] = useState<ProfileChangeRequest | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const reject = useRejectProfileChangeRequest();

  return (
    <SectionCard title={`프로필 변경 요청 승인 대기 (${requests.length})`}>
      {message && <div className={`px-4 pt-3 text-caption ${message.startsWith("처리 실패") ? "text-danger" : "text-success"}`} role="status">{message}</div>}
      {requests.length === 0 ? (
        <EmptyState message="대기 중인 프로필 변경 요청이 없습니다." />
      ) : (
        <TableWrap minWidth={700}>
          <table className="table">
            <thead><tr><th>신청자</th><th>변경 항목</th><th>사유</th><th>요청일</th><th className="text-right"></th></tr></thead>
            <tbody>
              {requests.map((request) => {
                const requester = users.find((user) => user.id === request.requesterId);
                return (
                  <tr
                    key={request.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${requester?.name ?? `사용자 ${request.requesterId}`} 프로필 변경 요청 상세`}
                    className="cursor-pointer hover:bg-canvas-subtle focus-visible:outline-none focus-visible:[&>td]:bg-[var(--color-accent-subtle)]"
                    onClick={() => setSelected(request)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(request); } }}
                    title="클릭 — 프로필 변경 요청 상세"
                  >
                    <td className="font-medium">{requester?.name ?? `사용자 #${request.requesterId}`}</td>
                    <td>{profileRequestedSummary(request)}</td>
                    <td className="text-fg-muted max-w-[240px] truncate" title={request.reason}>{request.reason}</td>
                    <td className="mono text-fg-muted whitespace-nowrap">{formatProfileDate(request.createdAt)}</td>
                    <td className="text-right"><button className="btn btn-sm" onClick={(event) => { event.stopPropagation(); setSelected(request); }}>상세</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}

      {selected && (
        <ProfileRequestDetailModal
          initial={selected}
          users={users}
          onClose={() => setSelected(null)}
          onReject={(request) => { setSelected(null); setRejecting(request); }}
        />
      )}
      {rejecting && (
        <ReasonModal
          mode="input"
          title="프로필 변경 요청 반려 — 사유 필수"
          onClose={() => setRejecting(null)}
          onSubmit={(reason) => {
            const id = rejecting.id;
            reject.mutate({ id, reason }, {
              onSuccess: () => setMessage("프로필 변경 요청을 반려했습니다."),
              onError: (caught) => setMessage(`처리 실패: ${errorMessage(caught, "반려하지 못했습니다.")}`),
            });
            setRejecting(null);
          }}
        />
      )}
    </SectionCard>
  );
}
