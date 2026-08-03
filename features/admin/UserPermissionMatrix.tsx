"use client";

import { useMemo, useState } from "react";
import type {
  CapabilityCategory,
  RoleCapability,
} from "@kms545487/contracts";
import { ReasonModal } from "@/components/ReasonModal";
import { Badge, EmptyState, LoadingState, SectionCard } from "@/components/ui";
import { apiErrorMessage } from "@/lib/api-error";
import { useSetUserPermission, useUserPermissions } from "@/lib/queries";
import { permissionToggle, type PermissionToggle } from "@/lib/domain/user-permissions";

const CATEGORY_LABEL: Record<CapabilityCategory, string> = {
  account: "계정·관리",
  calendar: "캘린더",
  attendance: "출결",
  approval: "승인",
  student: "학생·상담",
  finance: "재무",
  security: "보안",
};

export function UserPermissionMatrix({ userId }: { userId: number }) {
  const permissions = useUserPermissions(userId);
  const update = useSetUserPermission();
  const [pending, setPending] = useState<PermissionToggle | null>(null);
  const [error, setError] = useState("");
  const groups = useMemo(() => {
    const rows = permissions.data?.permissions ?? [];
    return Object.entries(CATEGORY_LABEL)
      .map(([category, label]) => ({
        category: category as CapabilityCategory,
        label,
        permissions: rows.filter((permission) => permission.category === category),
      }))
      .filter((group) => group.permissions.length > 0);
  }, [permissions.data]);

  return (
    <>
      <SectionCard
        title="업무 권한"
        action={permissions.data ? <Badge tone="neutral">권한 버전 {permissions.data.accessVersion}</Badge> : null}
      >
        <div className="p-4 space-y-4">
          <p className="text-caption text-fg-subtle">
            역할 기본값에 사용자별 예외를 적용합니다. 변경 즉시 대상자의 기존 로그인은 종료되며 재로그인 후 반영됩니다.
          </p>
          {error && <p className="text-caption text-danger" role="alert">{error}</p>}
          {permissions.isPending ? <LoadingState /> : permissions.isError ? (
            <EmptyState message={apiErrorMessage(permissions.error, "권한을 불러오지 못했습니다.")} />
          ) : !permissions.data ? <EmptyState message="권한 정보가 없습니다." /> : (
            <div className="space-y-5">
              {groups.map((group) => (
                <section key={group.category} aria-labelledby={`permission-${group.category}`}>
                  <h3 id={`permission-${group.category}`} className="mb-2 text-caption font-semibold text-fg-muted">{group.label}</h3>
                  <div className="divide-y divide-line-muted border-y border-line-muted">
                    {group.permissions.map((permission) => (
                      <div key={permission.capability} className="grid min-h-[64px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-body font-medium">{permission.label}</span>
                            {permission.override && <Badge tone="attention">개별 {permission.override === "allow" ? "허용" : "제한"}</Badge>}
                            {!permission.configurable && <Badge tone="neutral">고정 정책</Badge>}
                          </div>
                          <p className="mt-0.5 text-caption text-fg-subtle">{permission.description}</p>
                          <p className="mt-0.5 text-micro text-fg-subtle">
                            역할 기본값 {permission.roleDefault ? "허용" : "제한"}
                            {permission.capability === "attendance.manage" ? " · 대표자만 변경 가능" : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={permission.effective}
                          aria-label={`${permission.label} ${permission.effective ? "허용됨" : "제한됨"}`}
                          disabled={!permission.manageable || update.isPending}
                          className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${permission.effective ? "border-accent bg-accent" : "border-line bg-canvas-subtle"}`}
                          onClick={() => { setError(""); setPending(permissionToggle(permission)); }}
                        >
                          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${permission.effective ? "translate-x-5" : "translate-x-1"}`} />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      {pending && permissions.data && (
        <ReasonModal
          mode="input"
          title={`${pending.permission.label} ${pending.nextEffective ? "허용" : "제한"}`}
          submitLabel="권한 변경"
          placeholder="변경 사유를 5자 이상 입력하세요 (감사 이력에 남습니다)"
          minLength={5}
          maxLength={200}
          onClose={() => setPending(null)}
          onSubmit={(reason) => {
            setError("");
            update.mutate({
              id: userId,
              capability: pending.permission.capability as RoleCapability,
              input: {
                mode: pending.mode,
                reason,
                expectedAccessVersion: permissions.data.accessVersion,
              },
            }, {
              onSuccess: () => setPending(null),
              onError: (caught) => setError(apiErrorMessage(caught, "권한을 변경하지 못했습니다.")),
            });
          }}
        />
      )}
    </>
  );
}
