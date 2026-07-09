"use client";
// [참조/처리] 캘린더 뷰 프리셋 탭(TBO-12 P1, Lantiv 탭 대응) — 필터·스플릿·국가(시차) 조합을
//  이름으로 저장/적용/삭제. 저장소는 **백엔드 calendar_view_presets 컬렉션**(직원 공용 자산 —
//  localStorage 아님, 실DB 이관 시 그대로 테이블). 직렬화 규칙은 lib/domain/presets 단일 소스.
import { useState } from "react";
import type { CalendarViewPreset } from "@/types";
import { useViewPresets, useRemoveViewPreset } from "@/lib/queries";
import { countryByCode } from "@/lib/domain/tz";
import { PromptModal, ConfirmModal } from "@/components/ui";

export function CalendarViewTabs({
  activeId, onApply, onSaveCurrent, onMsg,
}: {
  activeId: number | null; // 마지막 적용 프리셋(필터 수동 변경 시 부모가 해제)
  onApply: (p: CalendarViewPreset) => void;
  onSaveCurrent: (name: string, updateId?: number) => Promise<void>; // 부모가 현재 상태 직렬화 후 저장/수정
  onMsg: (m: string) => void;
}) {
  const { data: presets = [] } = useViewPresets();
  const removePreset = useRemoveViewPreset();
  const [busy, setBusy] = useState(false);
  // [C-1] window.prompt/confirm → PromptModal/ConfirmModal(디자인 표준·헤드리스 QA 가능)
  const [saveOpen, setSaveOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CalendarViewPreset | null>(null);

  const doSave = async (name: string) => {
    const nm = name.trim();
    if (!nm) return;
    setSaveOpen(false);
    setBusy(true);
    try {
      const active = activeId != null ? presets.find((p) => Number(p.id) === Number(activeId)) : null;
      const updateId = active && active.name === nm ? Number(active.id) : undefined;
      await onSaveCurrent(nm, updateId);
      onMsg(`${updateId ? "프리셋 수정됨" : "프리셋 저장됨"} — ${nm}`);
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      onMsg(err.response?.data?.message ?? "프리셋 저장 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!presets.length ? (
        <div className="flex items-center gap-2">
          <button className="btn btn-sm" onClick={() => setSaveOpen(true)} disabled={busy} title="현재 필터·기간·국가 조합을 이름으로 저장(직원 공용)">
            + 뷰 저장
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 flex-wrap">
          {presets.map((p) => {
            const on = activeId === p.id;
            const flag = p.countryCode ? (countryByCode(p.countryCode)?.flag ?? "") : "";
            return (
              <span
                key={p.id}
                className={`inline-flex items-center gap-1 h-7 pl-2 pr-1 rounded-md border text-caption cursor-pointer ${on ? "badge-accent font-semibold" : "hover:bg-canvas-subtle"}`}
                style={{ borderColor: on ? "var(--color-accent)" : "var(--color-line)" }}
                onClick={() => onApply(p)}
                title={`적용 — ${p.view}${p.periodFrom ? ` · ${p.periodFrom}~${p.periodTo}` : ""}${p.countryCode ? ` · ${p.countryCode} 시간` : ""}`}
              >
                {flag && <span>{flag}</span>}
                {p.name}
                <button
                  className="w-4 h-4 grid place-items-center rounded opacity-60 hover:opacity-100"
                  aria-label={`${p.name} 삭제`}
                  onClick={(e) => { e.stopPropagation(); setPendingDelete(p); }}
                >
                  ✕
                </button>
              </span>
            );
          })}
          <button className="btn btn-sm h-7" onClick={() => setSaveOpen(true)} disabled={busy} title="현재 필터·기간·국가 조합을 저장">
            +
          </button>
        </div>
      )}

      {saveOpen && (
        <PromptModal
          title="뷰 프리셋 저장"
          fields={[{ name: "name", label: "프리셋 이름", required: true, placeholder: "예: 미국 학생 주간", hint: "현재 필터·기간·국가·스플릿 조합을 저장(직원 공용)" }]}
          submitLabel="저장"
          onClose={() => setSaveOpen(false)}
          onSubmit={(v) => doSave(v.name)}
        />
      )}
      {pendingDelete && (
        <ConfirmModal
          title="프리셋 삭제"
          danger
          confirmLabel="삭제"
          message={<>프리셋 “{pendingDelete.name}”을 삭제할까요? 직원 공용이라 모두에게서 사라집니다.</>}
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            const p = pendingDelete;
            setPendingDelete(null);
            removePreset.mutate(p.id, { onSuccess: () => onMsg(`프리셋 삭제됨 — ${p.name}`) });
          }}
        />
      )}
    </>
  );
}
