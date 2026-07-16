"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, EmptyState, LoadingState, PageHeader, SectionCard, TableWrap } from "@/components/ui";
import {
  formatProfileDate,
  PROFILE_STATUS_LABEL,
  PROFILE_STATUS_TONE,
  profileRequestedSummary,
} from "@/lib/domain/profile";
import { roleLabel } from "@/lib/roles";
import { useMyProfile, useMyProfileChangeRequests } from "@/lib/queries";
// [TBO-29B-4 V3] 변경 요청 모달은 인증 stepper 포함 별도 컴포넌트로 분리(단일 책임).
import ProfileChangeModal from "./ProfileChangeModal";

const valueOrDash = (value?: string | null) => value?.trim() || "—";

export default function MyPageView() {
  const profileQuery = useMyProfile();
  const requestsQuery = useMyProfileChangeRequests();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const profile = profileQuery.data;
  const requests = [...(requestsQuery.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="p-4 sm:p-6 max-w-[920px] mx-auto space-y-5">
      <PageHeader
        title="마이 페이지"
        sub="계정과 프로필 정보"
        actions={<Link className="btn btn-sm" href="/account/security">계정 보안</Link>}
      />

      <SectionCard
        title="계정·프로필"
        action={profile && (
          <button className="btn btn-sm btn-primary" onClick={() => { setMessage(null); setEditing(true); }}>
            변경
          </button>
        )}
      >
        {profileQuery.isPending ? (
          /* [B6 C3 2026-07-16] 자체 div 로딩 문구 → LoadingState(skeleton) 규격 */
          <LoadingState message="프로필을 불러오는 중..." />
        ) : profileQuery.isError || !profile ? (
          <EmptyState message="프로필을 불러오지 못했습니다." />
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 px-4 py-4 text-body">
            <div><dt className="text-caption text-fg-subtle">이름</dt><dd className="mt-0.5 font-medium break-words">{profile.name}</dd></div>
            <div><dt className="text-caption text-fg-subtle">연락처</dt><dd className="mt-0.5 break-words">{valueOrDash(profile.phone)}</dd></div>
            <div><dt className="text-caption text-fg-subtle">이메일</dt><dd className="mt-0.5 text-fg-muted break-all">{valueOrDash(profile.email)}</dd></div>
            <div><dt className="text-caption text-fg-subtle">Web ID</dt><dd className="mt-0.5 text-fg-muted break-all">{profile.webId}</dd></div>
            <div><dt className="text-caption text-fg-subtle">역할</dt><dd className="mt-0.5 text-fg-muted">{roleLabel[profile.role as keyof typeof roleLabel] ?? profile.role}</dd></div>
            <div><dt className="text-caption text-fg-subtle">계정 상태</dt><dd className="mt-0.5 text-fg-muted">{profile.status}</dd></div>
            <div><dt className="text-caption text-fg-subtle">국가 코드</dt><dd className="mt-0.5 mono">{valueOrDash(profile.countryCode)}</dd></div>
            <div><dt className="text-caption text-fg-subtle">시간대</dt><dd className="mt-0.5 mono break-all">{valueOrDash(profile.timeZone)}</dd></div>
          </dl>
        )}
        {message && <div className="border-t px-4 py-2.5 text-caption text-success" role="status">{message}</div>}
      </SectionCard>

      <SectionCard title={`변경 요청 이력 (${requests.length})`}>
        {requestsQuery.isPending ? (
          /* [B6 C3 2026-07-16] 자체 div 로딩 문구 → LoadingState(skeleton) 규격 */
          <LoadingState message="요청 이력을 불러오는 중..." />
        ) : requestsQuery.isError ? (
          <EmptyState message="변경 요청 이력을 불러오지 못했습니다." />
        ) : requests.length === 0 ? (
          <EmptyState message="프로필 변경 요청 이력이 없습니다." />
        ) : (
          <TableWrap minWidth={720}>
            <table className="table">
              <thead><tr><th>요청일</th><th>변경 항목</th><th>사유</th><th>상태</th><th>처리 결과</th></tr></thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td className="mono text-fg-muted whitespace-nowrap">{formatProfileDate(request.createdAt)}</td>
                    <td className="font-medium">{profileRequestedSummary(request)}</td>
                    <td className="text-fg-muted max-w-[240px] break-words">{request.reason}</td>
                    <td><Badge tone={PROFILE_STATUS_TONE[request.status]}>{PROFILE_STATUS_LABEL[request.status]}</Badge></td>
                    <td className="text-fg-muted max-w-[240px] break-words">
                      {request.status === "rejected" ? request.rejectionReason || "반려 사유 없음" : request.status === "approved" ? `프로필 v${request.appliedProfileVersion ?? "—"}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </SectionCard>

      {editing && profile && (
        <ProfileChangeModal
          profile={profile}
          onClose={() => setEditing(false)}
          // [E0.5 ①] 대표(super_admin)는 서버가 즉시 적용 — 응답 status로 메시지 분기.
          // [E0] 아이디 변경이 적용되면 auth_version+1로 세션이 무효 — 재로그인 안내.
          onCreated={(request) => {
            setEditing(false);
            const webIdChanged = request.requestedChanges?.webId !== undefined;
            setMessage(request.status === "approved"
              ? (webIdChanged
                ? "아이디 변경이 적용되었습니다. 보안을 위해 다시 로그인해 주세요."
                : "프로필 변경이 즉시 적용되었습니다.")
              : (webIdChanged
                ? "변경 요청을 등록했습니다. 아이디 변경은 승인되면 다시 로그인해야 합니다."
                : "프로필 변경 요청을 등록했습니다. 승인 후 반영됩니다."));
          }}
        />
      )}
    </div>
  );
}
