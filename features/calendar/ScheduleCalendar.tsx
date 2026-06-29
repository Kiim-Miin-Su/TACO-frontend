"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ScheduleRow, Room, Conflict } from "@/types";
import { api, type SchedulePatchBody } from "@/lib/api";
import { weekDates, weekdayOf } from "@/lib/domain/schedule";

// ── 그리드 상수 ──
const START_H = 9, END_H = 21, HOUR_H = 46, SNAP = 15;
const GRID_MIN = START_H * 60;
const GRID_H = (END_H - START_H) * HOUR_H;
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const PALETTE = ["#0969da", "#1a7f37", "#8250df", "#bf3989", "#9a6700", "#1b7c83"];

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fromMin = (mm: number) => `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
const snap = (mm: number) => Math.round(mm / SNAP) * SNAP;
const clampMin = (mm: number) => Math.max(GRID_MIN, Math.min(END_H * 60, mm));
const pad = (n: number) => String(n).padStart(2, "0");
function mondayISO(d = new Date()) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = x.getUTCDay();
  x.setUTCDate(x.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return x.toISOString().slice(0, 10);
}
const addDaysISO = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
const startMinOf = (r: ScheduleRow) => toMin(r.startTime ?? "09:00");
const endMinOf = (r: ScheduleRow) => (r.endTime ? toMin(r.endTime) : startMinOf(r) + r.durationMinutes);
const colorOf = (r: ScheduleRow) => r.color ?? PALETTE[r.courseId % PALETTE.length];

type View = "week" | "day";
type Resizing = { id: number; edge: "top" | "bottom"; startClientY: number; origStart: number; origEnd: number };

export function ScheduleCalendar() {
  const [view, setView] = useState<View>("week");
  const [weekStart, setWeekStart] = useState(mondayISO());
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  const [preview, setPreview] = useState<{ id: number; start: number; end: number } | null>(null);
  const [msg, setMsg] = useState("");

  const grabOffsetRef = useRef(0); // 드래그 시 블록 상단 대비 포인터 오프셋(분)
  const resizingRef = useRef<Resizing | null>(null);
  const previewRef = useRef<{ id: number; start: number; end: number } | null>(null);

  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const range = view === "week" ? { from: dates[0], to: dates[6] } : { from: day, to: day };

  const load = useCallback(async () => {
    try {
      const [sc, rm] = await Promise.all([
        api.schedule.list(range),
        rooms.length ? Promise.resolve(rooms) : api.rooms.list(),
      ]);
      setRows(sc);
      if (!rooms.length) setRooms(rm);
      setMsg("");
    } catch {
      setMsg("백엔드 연결 실패 — docker로 API(:3001)를 실행했는지 확인하세요.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  // 컬럼 정의: week=날짜, day=강의실
  const columns: { key: string; label: string; sub?: string; date: string; roomId?: number }[] =
    view === "week"
      ? dates.map((d) => ({ key: d, label: WD[weekdayOf(d)], sub: d.slice(5), date: d }))
      : rooms.map((r) => ({ key: `r${r.id}`, label: r.name, date: day, roomId: r.id }));

  const rowsOfColumn = (c: { date: string; roomId?: number }) =>
    rows.filter((r) => r.sessionDate === c.date && (c.roomId == null || r.roomId === c.roomId));

  // ── PATCH 적용(충돌 시 확인 후 force) ──
  async function applyPatch(id: number, patch: SchedulePatchBody) {
    try {
      await api.schedule.update(id, patch);
      await load();
    } catch (e) {
      const err = e as { response?: { status?: number; data?: { conflicts?: Conflict[] } } };
      if (err.response?.status === 409) {
        const cs = err.response.data?.conflicts ?? [];
        const types = cs.map((c) => `${c.resource ?? ""} ${c.type}`).join(", ");
        if (confirm(`충돌 ${cs.length}건 (${types}).\n그래도 적용할까요?`)) {
          await api.schedule.update(id, { ...patch, force: true });
        }
        await load();
      } else {
        setMsg("수정 실패");
        await load();
      }
    }
  }

  // ── 드래그 이동 ──
  const onDragStart = (e: React.DragEvent, r: ScheduleRow) => {
    if (resizingRef.current) { e.preventDefault(); return; } // 리사이즈 중엔 이동 금지
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    grabOffsetRef.current = ((e.clientY - rect.top) / HOUR_H) * 60;
    e.dataTransfer.setData("text/plain", String(r.id));
    e.dataTransfer.effectAllowed = "move";
  };
  const onColumnDrop = (e: React.DragEvent, c: { date: string; roomId?: number }) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData("text/plain"));
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    const colRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relMin = ((e.clientY - colRect.top) / HOUR_H) * 60 - grabOffsetRef.current;
    const newStart = clampMin(snap(GRID_MIN + relMin));
    const dur = r.durationMinutes;
    applyPatch(id, { sessionDate: c.date, startTime: fromMin(newStart), durationMinutes: dur, roomId: c.roomId ?? r.roomId });
  };

  // ── 리사이즈(시작/끝 핸들) ──
  const onResizeMove = (e: PointerEvent) => {
    const rz = resizingRef.current; if (!rz) return;
    const delta = snap(((e.clientY - rz.startClientY) / HOUR_H) * 60);
    let start = rz.origStart, end = rz.origEnd;
    if (rz.edge === "bottom") end = Math.max(rz.origStart + SNAP, clampMin(rz.origEnd + delta));
    else start = Math.min(rz.origEnd - SNAP, clampMin(rz.origStart + delta));
    const pv = { id: rz.id, start, end };
    previewRef.current = pv;
    setPreview(pv);
  };
  const onResizeUp = () => {
    window.removeEventListener("pointermove", onResizeMove);
    const rz = resizingRef.current;
    const pv = previewRef.current;
    resizingRef.current = null;
    previewRef.current = null;
    setPreview(null);
    if (!rz || !pv || pv.id !== rz.id) return;
    if (pv.start === rz.origStart && pv.end === rz.origEnd) return; // 변화 없음
    applyPatch(rz.id, { startTime: fromMin(pv.start), endTime: fromMin(pv.end) });
  };
  const onResizeDown = (e: React.PointerEvent, r: ScheduleRow, edge: "top" | "bottom") => {
    e.stopPropagation();
    resizingRef.current = { id: r.id, edge, startClientY: e.clientY, origStart: startMinOf(r), origEnd: endMinOf(r) };
    previewRef.current = { id: r.id, start: startMinOf(r), end: endMinOf(r) };
    setPreview(previewRef.current);
    window.addEventListener("pointermove", onResizeMove);
    window.addEventListener("pointerup", onResizeUp, { once: true });
  };

  return (
    <div className="p-6 max-w-[1280px] mx-auto space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[20px] font-semibold">스케줄 캘린더</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            드래그로 이동 · 위/아래 끝을 끌어 시간 조절 · 클릭하면 상세 편집 · {view === "week" ? `${dates[0]} ~ ${dates[6]}` : day}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-md overflow-hidden border" style={{ borderColor: "var(--color-line)" }}>
            <button className={`btn btn-sm rounded-none border-0 ${view === "week" ? "badge-accent" : ""}`} onClick={() => setView("week")}>주간</button>
            <button className={`btn btn-sm rounded-none border-0 ${view === "day" ? "badge-accent" : ""}`} onClick={() => setView("day")}>일간(강의실)</button>
          </div>
          {view === "week" ? (
            <>
              <button className="btn btn-sm" onClick={() => setWeekStart(addDaysISO(weekStart, -7))}>◀</button>
              <button className="btn btn-sm" onClick={() => setWeekStart(mondayISO())}>이번주</button>
              <button className="btn btn-sm" onClick={() => setWeekStart(addDaysISO(weekStart, 7))}>▶</button>
            </>
          ) : (
            <>
              <button className="btn btn-sm" onClick={() => setDay(addDaysISO(day, -1))}>◀</button>
              <input type="date" className="input h-7 w-36" value={day} onChange={(e) => setDay(e.target.value)} />
              <button className="btn btn-sm" onClick={() => setDay(addDaysISO(day, 1))}>▶</button>
            </>
          )}
        </div>
      </div>
      {msg && <div className="text-[12px] text-danger">{msg}</div>}

      <div className="card overflow-x-auto">
        <div className="flex min-w-[760px]">
          {/* 시간 거터 */}
          <div className="shrink-0" style={{ width: 56 }}>
            <div style={{ height: 34 }} />
            {Array.from({ length: END_H - START_H }, (_, i) => (
              <div key={i} className="text-[11px] text-fg-subtle mono text-right pr-2" style={{ height: HOUR_H }}>
                {pad(START_H + i)}:00
              </div>
            ))}
          </div>
          {/* 컬럼들 */}
          <div className="flex-1 flex">
            {columns.map((c) => (
              <div key={c.key} className="flex-1 border-l" style={{ borderColor: "var(--color-line-muted)", minWidth: 90 }}>
                <div className="text-center text-[12px] font-semibold py-1.5 border-b" style={{ height: 34, borderColor: "var(--color-line)" }}>
                  {c.label}{c.sub && <span className="text-fg-subtle font-normal"> {c.sub}</span>}
                </div>
                <div
                  className="relative"
                  style={{
                    height: GRID_H,
                    backgroundImage: `repeating-linear-gradient(var(--color-line-muted) 0 1px, transparent 1px ${HOUR_H}px)`,
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onColumnDrop(e, c)}
                >
                  {rowsOfColumn(c).map((r) => {
                    const pv = preview && preview.id === r.id ? preview : null;
                    const s = pv ? pv.start : startMinOf(r);
                    const en = pv ? pv.end : endMinOf(r);
                    const top = ((s - GRID_MIN) / 60) * HOUR_H;
                    const h = Math.max(18, ((en - s) / 60) * HOUR_H);
                    return (
                      <div
                        key={r.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, r)}
                        onClick={() => setEditing(r)}
                        title={`${r.courseName} · ${r.instructorName} · ${r.roomName ?? "-"}`}
                        className="absolute left-0.5 right-0.5 rounded text-white text-[10px] leading-tight px-1 py-0.5 cursor-grab overflow-hidden"
                        style={{ top, height: h, background: colorOf(r) }}
                      >
                        <div onPointerDown={(e) => onResizeDown(e, r, "top")} className="absolute left-0 right-0 top-0 h-1.5 cursor-ns-resize" />
                        <div className="font-semibold truncate">{fromMin(s)} {r.courseName}</div>
                        <div className="opacity-90 truncate">{view === "week" ? (r.roomName ?? "") : r.instructorName}</div>
                        <div onPointerDown={(e) => onResizeDown(e, r, "bottom")} className="absolute left-0 right-0 bottom-0 h-1.5 cursor-ns-resize" />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editing && (
        <EditModal
          row={editing}
          rooms={rooms}
          onClose={() => setEditing(null)}
          onSave={async (patch) => { setEditing(null); await applyPatch(editing.id, patch); }}
        />
      )}
    </div>
  );
}

function EditModal({ row, rooms, onClose, onSave }: {
  row: ScheduleRow; rooms: Room[];
  onClose: () => void; onSave: (patch: SchedulePatchBody) => void;
}) {
  const [date, setDate] = useState(row.sessionDate);
  const [start, setStart] = useState(row.startTime ?? "16:00");
  const [end, setEnd] = useState(row.endTime ?? fromMin(toMin(row.startTime ?? "16:00") + row.durationMinutes));
  const [roomId, setRoomId] = useState<number | "">(row.roomId ?? "");
  const [status, setStatus] = useState(row.status);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center" style={{ background: "rgba(0,0,0,.35)" }} onClick={onClose}>
      <div className="card card-pad w-[420px] space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold">{row.courseName} <span className="text-fg-subtle text-[12px]">· {row.instructorName}</span></div>
        <Field label="날짜"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="시작"><input type="time" step={900} className="input" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="종료"><input type="time" step={900} className="input" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <Field label="강의실">
          <select className="input" value={roomId} onChange={(e) => setRoomId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">미지정</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="상태">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as ScheduleRow["status"])}>
            {["scheduled", "held", "canceled", "no_show", "makeup"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={() => onSave({ sessionDate: date, startTime: start, endTime: end, roomId: roomId || undefined, status })}>저장</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-fg-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
