"use client";
// [참조/처리] 캘린더 뷰 프리셋 탭(TBO-12 P1, Lantiv 탭 대응) — 필터·스플릿·국가(시차) 조합을
//  이름으로 저장/적용/삭제. 저장소는 **백엔드 calendar_view_presets 컬렉션**(직원 공용 자산 —
//  localStorage 아님, 실DB 이관 시 그대로 테이블). 직렬화 규칙은 lib/domain/presets 단일 소스.
import { useState } from "react";
import type { CalendarViewPreset } from "@/types";
import { useViewPresets, useCreateViewPreset, useRemoveViewPreset } from "@/lib/queries";
import { countryByCode } from "@/lib/domain/tz";

export function CalendarViewTabs({
  activeId, onApply, onSaveCurrent, onMsg,
}: {
  activeId: number | null; // 마지막 적용 프리셋(필터 수동 변경 시 부모가 해제)
  onApply: (p: CalendarViewPreset) => void;
  onSaveCurrent: (name: string) => Promise<void>; // 부모가 현재 상태 직렬화 후 저장
  onMsg: (m: string) => void;
}) {
  const { data: presets = [] } = useViewPresets();
  const removePreset = useRemoveViewPreset();
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const name = prompt("현재 뷰(필터·기간·국가·스플릿)를 저장할 이름:", "");
    if (!name?.trim()) return;
    setBusy(true);
    try {
      await onSaveCurrent(name.trim());
      onMsg(`프리셋 저장됨 — ${name.trim()}`);
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      onMsg(err.response?.data?.message ?? "프리셋 저장 실패");
    } finally {
      setBusy(false);
    }
  };

  if (!presets.length)
    return (
      <div className="flex items-center gap-2">
        <button className="btn btn-sm" onClick={save} disabled={busy} title="현재 필터·기간·국가 조합을 이름으로 저장(직원 공용)">
          + 뷰 저장
        </button>
      </div>
    );

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {presets.map((p) => {
        const on = activeId === p.id;
        const flag = p.countryCode ? (countryByCode(p.countryCode)?.flag ?? "") : "";
        return (
          <span
            key={p.id}
            className={`inline-flex items-center gap-1 h-7 pl-2 pr-1 rounded-md border text-[12px] cursor-pointer ${on ? "badge-accent font-semibold" : "hover:bg-canvas-subtle"}`}
            style={{ borderColor: on ? "var(--color-accent)" : "var(--color-line)" }}
            onClick={() => onApply(p)}
            title={`적용 — ${p.view}${p.periodFrom ? ` · ${p.periodFrom}~${p.periodTo}` : ""}${p.countryCode ? ` · ${p.countryCode} 시간` : ""}`}
          >
            {flag && <span>{flag}</span>}
            {p.name}
            <button
              className="w-4 h-4 grid place-items-center rounded opacity-60 hover:opacity-100"
              aria-label={`${p.name} 삭제`}
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`프리셋 "${p.name}"을 삭제할까요? (직원 공용 — 모두에게서 사라집니다)`))
                  removePreset.mutate(p.id, { onSuccess: () => onMsg(`프리셋 삭제됨 — ${p.name}`) });
              }}
            >
              ✕
            </button>
          </span>
        );
      })}
      <button className="btn btn-sm h-7" onClick={save} disabled={busy} title="현재 필터·기간·국가 조합을 저장">
        +
      </button>
    </div>
  );
}
