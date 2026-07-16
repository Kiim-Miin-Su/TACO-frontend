// [B4 2026-07-16 대표 결정 ②] 단일 컴포넌트 — 수업탭·수업 추가 모달이 같은 것을 재사용(사설 사본 금지).
//  강의실 목록(이름·정원·활성) + 행 인라인 수정 + 삭제(ConfirmModal) + 신규 추가 폼(정원 기본 1명).
//  쓰기 API는 매니저 이상 전용(강사 403) — calendar.manage 미보유 계정에는 렌더하지 않는다.
//  캐시는 qk.rooms 단일 키: 생성/수정/삭제 성공 시 invalidate → 수업 추가 모달 select도 자동 갱신.
"use client";
import { useState } from "react";
import type { Room } from "@/types";
import { Badge, ConfirmModal, EmptyState, LoadingState, TableWrap } from "@/components/ui";
import { useCreateRoom, useRemoveRoom, useRooms, useUpdateRoom } from "@/lib/queries";
import { useAccountAccess } from "@/lib/useAccountAccess";

// 실패 사유 표면화 — CoursesView 폼 규약과 동일(서버 message 우선, 배열이면 join).
const serverError = (caught: unknown, fallback: string) => {
  const msg = (caught as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
  return Array.isArray(msg) ? msg.join(" ") : msg ?? fallback;
};

export function RoomManagerPanel({ compact }: { compact?: boolean }) {
  const { can } = useAccountAccess();
  const { data: rooms = [], isPending: loading } = useRooms();
  const createRoom = useCreateRoom();
  const updateRoom = useUpdateRoom();
  const removeRoom = useRemoveRoom();

  // 행 인라인 수정(이름/정원/활성) — 한 번에 한 행만.
  const [editing, setEditing] = useState<{ id: number; name: string; capacity: string; isActive: boolean } | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Room | null>(null);
  // 신규 추가 폼 — 이름 + 정원(기본 1명, BE 기본값과 동일).
  const [newName, setNewName] = useState("");
  const [newCapacity, setNewCapacity] = useState("1");
  const [formError, setFormError] = useState<string | null>(null);

  if (!can("calendar.manage")) return null; // 강의실 쓰기 API는 매니저 이상(강사 403) — 노출 자체를 차단

  const busy = createRoom.isPending || updateRoom.isPending || removeRoom.isPending;
  const pad = compact ? "p-2" : "p-4";

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!newName.trim()) { setFormError("강의실 이름을 입력해 주세요."); return; }
    const capacity = Number(newCapacity);
    if (!Number.isInteger(capacity) || capacity < 1) { setFormError("정원은 1명 이상의 정수여야 합니다."); return; }
    createRoom.mutate(
      { name: newName.trim(), capacity },
      {
        onSuccess: () => { setNewName(""); setNewCapacity("1"); },
        onError: (caught) => setFormError(serverError(caught, "강의실을 추가하지 못했습니다. 다시 시도해 주세요.")),
      },
    );
  };

  const saveEdit = () => {
    if (!editing) return;
    setRowError(null);
    if (!editing.name.trim()) { setRowError("강의실 이름을 입력해 주세요."); return; }
    const capacity = Number(editing.capacity);
    if (!Number.isInteger(capacity) || capacity < 1) { setRowError("정원은 1명 이상의 정수여야 합니다."); return; }
    updateRoom.mutate(
      { id: editing.id, patch: { name: editing.name.trim(), capacity, isActive: editing.isActive } },
      {
        onSuccess: () => setEditing(null),
        onError: (caught) => setRowError(serverError(caught, "강의실을 수정하지 못했습니다. 다시 시도해 주세요.")),
      },
    );
  };

  return (
    <div className={`${pad} space-y-3`}>
      {loading ? (
        <LoadingState />
      ) : rooms.length === 0 ? (
        <EmptyState message="등록된 강의실이 없습니다. 아래에서 강의실을 추가하세요." />
      ) : (
        <TableWrap>
          <table className="table">
            <thead><tr><th>강의실</th><th className="text-right">정원</th><th>활성</th><th className="w-px" /></tr></thead>
            <tbody>
              {rooms.map((r) =>
                editing?.id === r.id ? (
                  <tr key={r.id}>
                    <td>
                      <input className="input h-8" value={editing.name} aria-label="강의실 이름"
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                    </td>
                    <td className="text-right">
                      <input className="input h-8 w-20 text-right" type="number" min={1} value={editing.capacity} aria-label="정원(명)"
                        onChange={(e) => setEditing({ ...editing, capacity: e.target.value })} />
                    </td>
                    <td>
                      <label className="flex items-center gap-1.5 text-caption cursor-pointer">
                        <input type="checkbox" checked={editing.isActive}
                          onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} />
                        활성
                      </label>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {rowError && <span className="text-caption text-danger" role="alert">{rowError}</span>}
                        <button type="button" className="btn btn-sm btn-primary" disabled={updateRoom.isPending} onClick={saveEdit}>
                          {updateRoom.isPending ? "저장 중…" : "저장"}
                        </button>
                        <button type="button" className="btn btn-sm" disabled={updateRoom.isPending}
                          onClick={() => { setEditing(null); setRowError(null); }}>취소</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={r.id}>
                    <td className="font-medium">
                      {r.color && <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ background: r.color }} />}
                      {r.name}
                    </td>
                    <td className="text-right mono">{r.capacity ?? 1}명</td>
                    <td><Badge tone={r.isActive ? "success" : "neutral"}>{r.isActive ? "활성" : "비활성"}</Badge></td>
                    <td className="text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button type="button" className="btn btn-sm" disabled={busy}
                          onClick={() => { setRowError(null); setEditing({ id: r.id, name: r.name, capacity: String(r.capacity ?? 1), isActive: r.isActive }); }}>수정</button>
                        <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => setConfirmRemove(r)}>삭제</button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </TableWrap>
      )}

      {/* 신규 추가 — 이름 + 정원(기본 1명). 실패 시 인라인 에러(role=alert)·제출 중 disabled(폼 규약). */}
      <form onSubmit={submitCreate} className="flex flex-wrap items-center gap-2">
        <input className="input h-8 flex-1 min-w-[140px]" placeholder="강의실 이름 (예: A101)" aria-label="강의실 이름"
          value={newName} onChange={(e) => setNewName(e.target.value)} />
        <input className="input h-8 w-24 text-right" type="number" min={1} placeholder="정원" aria-label="정원(명)"
          value={newCapacity} onChange={(e) => setNewCapacity(e.target.value)} />
        <button type="submit" className="btn btn-sm btn-primary" disabled={createRoom.isPending}>
          {createRoom.isPending ? "추가 중…" : "강의실 추가"}
        </button>
        {formError && <span className="text-caption text-danger w-full" role="alert">{formError}</span>}
      </form>

      {confirmRemove && (
        <ConfirmModal
          title="강의실 삭제"
          message={<>강의실 <b>{confirmRemove.name}</b>을(를) 삭제할까요? 기존 수업의 강의실 표시에 영향을 줄 수 있습니다.</>}
          confirmLabel={removeRoom.isPending ? "삭제 중…" : "삭제"}
          danger
          onClose={() => setConfirmRemove(null)}
          onConfirm={() => {
            if (removeRoom.isPending) return;
            setRowError(null);
            removeRoom.mutate(confirmRemove.id, {
              onSuccess: () => setConfirmRemove(null),
              onError: (caught) => { setConfirmRemove(null); setRowError(serverError(caught, "강의실을 삭제하지 못했습니다. 다시 시도해 주세요.")); },
            });
          }}
        />
      )}
      {/* 삭제 실패 사유 — 편집 중이 아니어도 표면화(행 인라인 에러와 동일 톤) */}
      {!editing && rowError && <p className="text-caption text-danger" role="alert">{rowError}</p>}
    </div>
  );
}
