"use client";

import Link from "next/link";
import { apiErrorMessage } from '@/lib/api-error'; // [TBO-34 C3] 오류 파싱 단일 진실원
import { useState } from "react";
import { Badge, ConfirmModal, EmptyState, LoadingState, PageHeader, SectionCard, TableWrap } from "@/components/ui";
import {
  formatProfileDate,
  PROFILE_STATUS_LABEL,
  PROFILE_STATUS_TONE,
  profileRequestedSummary,
} from "@/lib/domain/profile";
import { roleLabel } from "@/lib/roles";
// [TBO-31 C2/C3 2026-07-16] 비밀번호 재설정 메일 — 중앙 훅(useRequestPasswordReset, §18-2).
import { useMyProfile, useMyProfileChangeRequests, useRequestPasswordReset } from "@/lib/queries";
// [TBO-29B-4 V3] 변경 요청 모달은 인증 stepper 포함 별도 컴포넌트로 분리(단일 책임).
import ProfileChangeModal from "./ProfileChangeModal";

const valueOrDash = (value?: string | null) => value?.trim() || "—";

export default function MyPageView() {
  const profileQuery = useMyProfile();
  const requestsQuery = useMyProfileChangeRequests();
  const requestReset = useRequestPasswordReset(); // [TBO-31 C2/C3 2026-07-16] 재설정 메일 받기
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetDevUrl, setResetDevUrl] = useState<string | null>(null);
  const profile = profileQuery.data;
  const requests = [...(requestsQuery.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // [TBO-31 C2/C3] 비밀번호 재설정 메일 — 본인 webId+등록 이메일로 공개 복구 호출(ConfirmModal 경유).
  function sendResetMail() {
    if (!profile?.email) return;
    setResetConfirm(false);
    setMessage(null);
    setError(null);
    setResetDevUrl(null);
    requestReset.mutate(
      { webId: profile.webId, email: profile.email },
      {
        onSuccess: (res) => {
          setMessage(res.message);
          if (res.devResetUrl) setResetDevUrl(res.devResetUrl);
        },
        onError: (caught) => setError(apiErrorMessage(caught, "재설정 메일 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.")),
      },
    );
  }

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
            <div>
              <dt className="text-caption text-fg-subtle">이메일</dt>
              <dd className="mt-0.5 text-fg-muted break-all">
                {/* [TBO-31 C2/C3 2026-07-16] 이메일 인증 상태 배지 — 미인증=주의 톤+계정 보안 안내.
                    RRN은 마이 페이지 어디에도 표시하지 않는다(마스킹조차 — D5). */}
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  {valueOrDash(profile.email)}
                  {profile.emailVerified === true
                    ? <Badge tone="success">인증됨</Badge>
                    : <Badge tone="attention">미인증</Badge>}
                </span>
                {profile.emailVerified !== true && (
                  <p className="mt-1 text-caption text-fg-muted">
                    이메일이 아직 인증되지 않았습니다. 계정 보안(알림·비밀번호 찾기)을 위해{" "}
                    <Link href="/account/security" className="text-accent hover:underline">계정 보안</Link>에서 본인 확인을 완료해 주세요.
                  </p>
                )}
              </dd>
            </div>
            <div><dt className="text-caption text-fg-subtle">Web ID</dt><dd className="mt-0.5 text-fg-muted break-all">{profile.webId}</dd></div>
            <div><dt className="text-caption text-fg-subtle">역할</dt><dd className="mt-0.5 text-fg-muted">{roleLabel[profile.role as keyof typeof roleLabel] ?? profile.role}</dd></div>
            <div><dt className="text-caption text-fg-subtle">계정 상태</dt><dd className="mt-0.5 text-fg-muted">{profile.status}</dd></div>
            <div><dt className="text-caption text-fg-subtle">국가 코드</dt><dd className="mt-0.5 mono">{valueOrDash(profile.countryCode)}</dd></div>
            <div><dt className="text-caption text-fg-subtle">시간대</dt><dd className="mt-0.5 mono break-all">{valueOrDash(profile.timeZone)}</dd></div>
          </dl>
        )}
        {/* [TBO-31 C2/C3 2026-07-16] 보안 진입 강화 — 비밀번호 변경 직접 버튼 + 재설정 메일 받기
            (비밀번호를 잊었을 때 현재 비밀번호 없이 복구 진입 — D5).
            대학·전공 표시는 생략: /users/me/profile 응답(ProfileResponseDto)에 해당 필드가 없다. */}
        {profile && (
          <div className="border-t px-4 py-3 flex flex-wrap items-center gap-2">
            <Link className="btn btn-sm" href="/account/security">비밀번호 변경</Link>
            <button
              className="btn btn-sm"
              onClick={() => { setMessage(null); setError(null); setResetConfirm(true); }}
              disabled={!profile.email?.trim() || requestReset.isPending}
            >
              {requestReset.isPending ? "메일 요청 중..." : "비밀번호 재설정 메일 받기"}
            </button>
            {!profile.email?.trim() && (
              <span className="text-caption text-fg-subtle">재설정 메일은 등록된 이메일이 있어야 받을 수 있습니다.</span>
            )}
          </div>
        )}
        {message && <div className="border-t px-4 py-2.5 text-caption text-success" role="status">{message}</div>}
        {resetDevUrl && (
          <div className="border-t px-4 py-2.5 text-caption text-accent break-all">개발 모드 재설정 링크: {resetDevUrl}</div>
        )}
        {error && <div className="border-t px-4 py-2.5 text-caption text-danger" role="alert">{error}</div>}
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

      {/* [TBO-31 C2/C3 2026-07-16] 재설정 메일 확인 — ConfirmModal(§18-1) → 성공 안내(열거 방지 동일 문구) */}
      {resetConfirm && profile?.email && (
        <ConfirmModal
          title="비밀번호 재설정 메일"
          message={`${profile.email}(으)로 비밀번호 재설정 링크를 보낼까요? 링크에서 현재 비밀번호 없이 새 비밀번호를 설정할 수 있습니다.`}
          confirmLabel="메일 받기"
          onClose={() => setResetConfirm(false)}
          onConfirm={sendResetMail}
        />
      )}

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
