"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, EmptyState, Field, ModalShell, PageHeader, SectionCard, TableWrap } from "@/components/ui";
import type { MyProfile } from "@/lib/api";
import {
  buildProfileChangePayload,
  formatProfileDate,
  PROFILE_STATUS_LABEL,
  PROFILE_STATUS_TONE,
  profileRequestedSummary,
  type ProfileChangeDraft,
} from "@/lib/domain/profile";
import { roleLabel } from "@/lib/roles";
import { useCreateProfileChangeRequest, useMyProfile, useMyProfileChangeRequests } from "@/lib/queries";
import type { AccountRole } from "@/types";
import { useTacoStore } from "@/lib/store";

const valueOrDash = (value?: string | null) => value?.trim() || "—";

function ProfileChangeModal({ profile, onClose, onCreated }: { profile: MyProfile; onClose: () => void; onCreated: () => void }) {
  const createRequest = useCreateProfileChangeRequest();
  const [draft, setDraft] = useState<ProfileChangeDraft>({
    name: profile.name,
    phone: profile.phone ?? "",
    countryCode: profile.countryCode ?? "",
    timeZone: profile.timeZone ?? "",
    reason: "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (field: keyof ProfileChangeDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }));

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const result = buildProfileChangePayload(profile, draft);
    if (!result.payload) {
      setError(result.error ?? "변경 내용을 확인해 주세요.");
      return;
    }
    createRequest.mutate(result.payload, {
      onSuccess: onCreated,
      onError: (caught) => {
        const apiError = caught as { response?: { data?: { message?: string | string[] } } };
        const message = apiError.response?.data?.message;
        setError(Array.isArray(message) ? message.join(" ") : message ?? "프로필 변경을 요청하지 못했습니다.");
      },
    });
  }

  return (
    <ModalShell
      title="프로필 변경 요청"
      size="md"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn btn-sm" onClick={onClose} disabled={createRequest.isPending}>취소</button>
          <button type="submit" form="profile-change-form" className="btn btn-sm btn-primary" disabled={createRequest.isPending}>
            {createRequest.isPending ? "요청 중..." : "변경 요청"}
          </button>
        </>
      )}
    >
      <form id="profile-change-form" className="grid grid-cols-1 sm:grid-cols-2 gap-3" onSubmit={submit}>
        <Field label="이름">
          <input className="input w-full" data-modal-autofocus="true" required maxLength={50} value={draft.name} onChange={(event) => set("name", event.target.value)} />
        </Field>
        <Field label="연락처">
          <input className="input w-full" type="tel" maxLength={20} value={draft.phone} onChange={(event) => set("phone", event.target.value)} />
        </Field>
        <Field label="국가 코드" hint="국가/권역 코드 (예: KR, US-W)">
          <input className="input w-full uppercase" inputMode="text" maxLength={8} value={draft.countryCode} onChange={(event) => set("countryCode", event.target.value.toUpperCase())} />
        </Field>
        <Field label="시간대" hint="IANA 시간대 (예: Asia/Seoul)">
          <input className="input w-full" maxLength={64} value={draft.timeZone} onChange={(event) => set("timeZone", event.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="변경 사유">
            <textarea className="input w-full min-h-24 resize-y" required maxLength={500} value={draft.reason} onChange={(event) => set("reason", event.target.value)} />
          </Field>
        </div>
        {error && <p className="sm:col-span-2 text-body text-danger" role="alert">{error}</p>}
      </form>
    </ModalShell>
  );
}

export default function MyPageView() {
  const profileQuery = useMyProfile();
  const requestsQuery = useMyProfileChangeRequests();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const profile = profileQuery.data;
  const setCurrentAccount = useTacoStore((state) => state.setCurrentAccount);
  const requests = [...(requestsQuery.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  useEffect(() => {
    if (!profile) return;
    setCurrentAccount({ id: profile.id, name: profile.name, role: profile.role as AccountRole });
  }, [profile, setCurrentAccount]);

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
          <div className="px-4 py-8 text-body text-fg-muted">프로필을 불러오는 중...</div>
        ) : profileQuery.isError || !profile ? (
          <EmptyState message="프로필을 불러오지 못했습니다." />
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 px-4 py-4 text-body">
            <div><dt className="text-caption text-fg-subtle">이름</dt><dd className="mt-0.5 font-medium break-words">{profile.name}</dd></div>
            <div><dt className="text-caption text-fg-subtle">연락처</dt><dd className="mt-0.5 break-words">{valueOrDash(profile.phone)}</dd></div>
            <div><dt className="text-caption text-fg-subtle">이메일</dt><dd className="mt-0.5 text-fg-muted break-all">{valueOrDash(profile.email)}</dd></div>
            <div><dt className="text-caption text-fg-subtle">Web ID</dt><dd className="mt-0.5 text-fg-muted break-all">{profile.webId}</dd></div>
            <div><dt className="text-caption text-fg-subtle">역할</dt><dd className="mt-0.5 text-fg-muted">{roleLabel[profile.role as AccountRole] ?? profile.role}</dd></div>
            <div><dt className="text-caption text-fg-subtle">계정 상태</dt><dd className="mt-0.5 text-fg-muted">{profile.status}</dd></div>
            <div><dt className="text-caption text-fg-subtle">국가 코드</dt><dd className="mt-0.5 mono">{valueOrDash(profile.countryCode)}</dd></div>
            <div><dt className="text-caption text-fg-subtle">시간대</dt><dd className="mt-0.5 mono break-all">{valueOrDash(profile.timeZone)}</dd></div>
          </dl>
        )}
        {message && <div className="border-t px-4 py-2.5 text-caption text-success" role="status">{message}</div>}
      </SectionCard>

      <SectionCard title={`변경 요청 이력 (${requests.length})`}>
        {requestsQuery.isPending ? (
          <div className="px-4 py-8 text-body text-fg-muted">요청 이력을 불러오는 중...</div>
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
          onCreated={() => { setEditing(false); setMessage("프로필 변경 요청을 등록했습니다."); }}
        />
      )}
    </div>
  );
}
