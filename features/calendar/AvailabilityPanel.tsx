"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ScheduleResources, ScheduleResource, AvailabilityBlock, ScheduleRow, Conflict } from "@/types";
import { api } from "@/lib/api";
import { recommendForStudent, suggestPairSlots, type StudentReco } from "@/lib/domain/schedule";

const WD = ["일", "월", "화", "수", "목", "금", "토"];

// 가용/불가 편집 + (학생 중심) 수업·강사 추천 + 추천→배정. 우측 드로어.
export function AvailabilityPanel({
  selected, resources, weekStart, sessions, onClose, onChanged,
}: {
  selected: ScheduleResource;
  resources: ScheduleResources;
  weekStart: string;
  sessions: ScheduleRow[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [allBlocks, setAllBlocks] = useState<AvailabilityBlock[]>([]);
  const [msg, setMsg] = useState("");

  const loadBlocks = useCallback(async () => {
    try { setAllBlocks(await api.availability.all()); } catch { setMsg("가용시간 로드 실패"); }
  }, []);
  useEffect(() => { loadBlocks(); }, [loadBlocks]);

  const myBlocks = useMemo(
    () => allBlocks.filter((b) => b.ownerType === selected.type && b.ownerId === selected.id)
      .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)),
    [allBlocks, selected],
  );

  // ── 가용/불가 추가 폼 ──
  const [kind, setKind] = useState<"available" | "unavailable">("available");
  const [weekday, setWeekday] = useState(1);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("12:00");

  async function addBlock() {
    if (start >= end) { setMsg("종료가 시작보다 빨라요"); return; }
    await api.availability.upsert({ ownerType: selected.type, ownerId: selected.id, kind, weekday, startTime: start, endTime: end });
    setMsg(""); await loadBlocks(); onChanged();
  }
  async function delBlock(id: number) {
    await api.availability.remove(id); await loadBlocks(); onChanged();
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" style={{ background: "rgba(0,0,0,.3)" }} onClick={onClose}>
      <div className="w-[420px] max-w-[92vw] h-full bg-canvas border-l overflow-y-auto" style={{ borderColor: "var(--color-line)" }} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-canvas border-b px-4 h-12 flex items-center justify-between z-10" style={{ borderColor: "var(--color-line)" }}>
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: selected.color ?? "var(--color-line)" }} />
            <span className="font-semibold text-[14px]">{selected.name}</span>
            <span className="text-[12px] text-fg-subtle">{selected.type === "student" ? "학생" : selected.type === "instructor" ? "강사" : "강의실"} 가용·추천</span>
          </div>
          <button className="btn btn-sm" onClick={onClose}>닫기</button>
        </div>

        <div className="p-4 space-y-5">
          {/* 가용/불가 편집 */}
          <section className="space-y-2">
            <h3 className="text-[13px] font-semibold">가용 · 불가시간</h3>
            <div className="space-y-1">
              {myBlocks.map((b) => (
                <div key={b.id} className="flex items-center gap-2 text-[12px] rounded px-2 h-8"
                  style={{ background: b.kind === "unavailable" ? "var(--color-neutral-subtle)" : "var(--color-accent-subtle)" }}>
                  <span className="font-medium w-7">{WD[b.weekday]}</span>
                  <span className="mono flex-1">{b.startTime}–{b.endTime}</span>
                  <span className={b.kind === "unavailable" ? "text-fg-muted" : "text-accent"}>{b.kind === "unavailable" ? "불가" : "가용"}</span>
                  <button className="text-fg-subtle hover:text-danger" onClick={() => delBlock(b.id)} title="삭제">✕</button>
                </div>
              ))}
              {!myBlocks.length && <div className="text-[12px] text-fg-subtle">등록된 가용/불가시간이 없습니다.</div>}
            </div>
            <div className="flex items-end gap-1.5 flex-wrap pt-1">
              <select className="input h-8 w-20" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="available">가용</option>
                <option value="unavailable">불가</option>
              </select>
              <select className="input h-8 w-16" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                {WD.map((w, i) => <option key={i} value={i}>{w}</option>)}
              </select>
              <input type="time" step={900} className="input h-8 w-24" value={start} onChange={(e) => setStart(e.target.value)} />
              <input type="time" step={900} className="input h-8 w-24" value={end} onChange={(e) => setEnd(e.target.value)} />
              <button className="btn btn-sm btn-primary" onClick={addBlock}>추가</button>
            </div>
          </section>

          {/* 추천 */}
          {selected.type === "student" && (
            <StudentReco selected={selected} resources={resources} weekStart={weekStart} sessions={sessions} blocks={allBlocks} onChanged={() => { loadBlocks(); onChanged(); }} setMsg={setMsg} />
          )}
          {selected.type === "instructor" && (
            <InstructorReco selected={selected} resources={resources} weekStart={weekStart} sessions={sessions} blocks={allBlocks} onChanged={() => { loadBlocks(); onChanged(); }} setMsg={setMsg} />
          )}
          {selected.type === "room" && (
            <p className="text-[12px] text-fg-subtle">강의실은 가용/불가시간만 관리합니다. 추천은 학생·강사를 선택하세요.</p>
          )}

          {msg && <div className="text-[12px] text-danger">{msg}</div>}
        </div>
      </div>
    </div>
  );
}

async function assign(body: { courseId: number; instructorId: number; roomId?: number; sessionDate: string; startTime: string; endTime: string; force?: boolean }, setMsg: (s: string) => void, onChanged: () => void) {
  try {
    await api.schedule.create(body);
    setMsg(""); onChanged();
  } catch (e) {
    const err = e as { response?: { status?: number; data?: { conflicts?: Conflict[] } } };
    if (err.response?.status === 409) {
      const cs = err.response.data?.conflicts ?? [];
      if (confirm(`강사/강의실 충돌 ${cs.length}건. 그래도 배정할까요? (이후 캘린더에서 조정 가능)`)) {
        await api.schedule.create({ ...body, force: true }); onChanged();
      }
    } else setMsg("배정 실패");
  }
}

// 학생 중심: 학생 스케줄에 맞는 수업·강사 추천. 시간이 안 되는 강사는 다른 색(주황)으로 표시하되 선택(조정) 가능.
function StudentReco({ selected, resources, weekStart, sessions, blocks, onChanged, setMsg }: {
  selected: ScheduleResource; resources: ScheduleResources; weekStart: string;
  sessions: ScheduleRow[]; blocks: AvailabilityBlock[]; onChanged: () => void; setMsg: (s: string) => void;
}) {
  const [dur, setDur] = useState(90);
  const [roomId, setRoomId] = useState<number | "">("");
  const instName = (id: number) => resources.instructors.find((i) => i.id === id)?.name;

  const recos = useMemo<StudentReco[]>(() => recommendForStudent(
    {
      weekStart, durationMinutes: dur, studentId: selected.id, roomId: roomId || undefined,
      courses: resources.courses.map((c) => ({ id: c.id, name: c.name, instructorId: c.instructorId, instructorName: instName(c.instructorId), color: c.color })),
    },
    { sessions, blocks, limit: 24 },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [weekStart, dur, roomId, selected.id, sessions, blocks, resources]);

  const freeCount = recos.filter((r) => r.instructorFree).length;

  return (
    <section className="space-y-2">
      <h3 className="text-[13px] font-semibold">이 학생에게 맞는 수업·강사 추천</h3>
      <p className="text-[12px] text-fg-subtle">학생 가용시간 기준. 강사가 비는 슬롯은 초록, 시간 조정이 필요한 강사는 주황으로 표시됩니다.</p>
      <div className="flex items-center gap-2 text-[12px]">
        <label className="flex items-center gap-1">길이
          <select className="input h-8 w-20" value={dur} onChange={(e) => setDur(Number(e.target.value))}>
            {[60, 90, 120].map((d) => <option key={d} value={d}>{d}분</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">강의실
          <select className="input h-8 w-28" value={roomId} onChange={(e) => setRoomId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">미지정</option>
            {resources.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <span className="text-fg-subtle ml-auto">가능 {freeCount} / 전체 {recos.length}</span>
      </div>
      <div className="space-y-1 max-h-[300px] overflow-y-auto">
        {recos.map((r, i) => (
          <div key={i} className="flex items-center gap-2 rounded border px-2 h-10 text-[12px]"
            style={{ borderColor: r.instructorFree ? "var(--color-success)" : "var(--color-attention)", background: r.instructorFree ? "var(--color-success-subtle)" : "var(--color-attention-subtle)" }}>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{WD[r.weekday]} {r.startTime}–{r.endTime} · {r.courseName}</div>
              <div className="text-fg-subtle truncate">{r.instructorName ?? `강사 ${r.instructorId}`} · {r.instructorFree ? "강사 가능" : r.reason}</div>
            </div>
            <button className="btn btn-sm" onClick={() => assign(
              { courseId: r.courseId, instructorId: r.instructorId, roomId: roomId || undefined, sessionDate: r.date, startTime: r.startTime, endTime: r.endTime, force: !r.instructorFree },
              setMsg, onChanged)}>
              {r.instructorFree ? "배정" : "조정 배정"}
            </button>
          </div>
        ))}
        {!recos.length && <div className="text-[12px] text-fg-subtle py-3 text-center">추천 슬롯이 없습니다. 학생 가용시간을 추가해 보세요.</div>}
      </div>
    </section>
  );
}

// 강사 중심: 학생 선택 → 학생가용 ∧ 강사가용 슬롯 추천 → 코스 선택 후 배정.
function InstructorReco({ selected, resources, weekStart, sessions, blocks, onChanged, setMsg }: {
  selected: ScheduleResource; resources: ScheduleResources; weekStart: string;
  sessions: ScheduleRow[]; blocks: AvailabilityBlock[]; onChanged: () => void; setMsg: (s: string) => void;
}) {
  const myCourses = resources.courses.filter((c) => c.instructorId === selected.id);
  const [studentId, setStudentId] = useState<number | "">("");
  const [courseId, setCourseId] = useState<number | "">(myCourses[0]?.id ?? "");
  const [dur, setDur] = useState(90);
  const [roomId, setRoomId] = useState<number | "">("");

  const slots = useMemo(() => suggestPairSlots(
    { weekStart, durationMinutes: dur, instructorId: selected.id, studentId: studentId || undefined, roomId: roomId || undefined },
    { sessions, blocks, limit: 24 },
  ), [weekStart, dur, selected.id, studentId, roomId, sessions, blocks]);

  return (
    <section className="space-y-2">
      <h3 className="text-[13px] font-semibold">가용 슬롯 추천 (강사 ∧ 학생)</h3>
      <div className="grid grid-cols-2 gap-1.5 text-[12px]">
        <label className="flex items-center gap-1">학생
          <select className="input h-8 flex-1" value={studentId} onChange={(e) => setStudentId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">(강사만)</option>
            {resources.students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">코스
          <select className="input h-8 flex-1" value={courseId} onChange={(e) => setCourseId(e.target.value ? Number(e.target.value) : "")}>
            {myCourses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">길이
          <select className="input h-8 flex-1" value={dur} onChange={(e) => setDur(Number(e.target.value))}>
            {[60, 90, 120].map((d) => <option key={d} value={d}>{d}분</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">강의실
          <select className="input h-8 flex-1" value={roomId} onChange={(e) => setRoomId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">미지정</option>
            {resources.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
      </div>
      <div className="space-y-1 max-h-[260px] overflow-y-auto">
        {slots.map((s, i) => (
          <div key={i} className="flex items-center gap-2 rounded border px-2 h-9 text-[12px]" style={{ borderColor: "var(--color-line)" }}>
            <span className="flex-1 mono">{WD[s.weekday]} {s.date.slice(5)} · {s.startTime}–{s.endTime}</span>
            <button className="btn btn-sm" disabled={!courseId} onClick={() => courseId && assign(
              { courseId: Number(courseId), instructorId: selected.id, roomId: roomId || undefined, sessionDate: s.date, startTime: s.startTime, endTime: s.endTime },
              setMsg, onChanged)}>배정</button>
          </div>
        ))}
        {!slots.length && <div className="text-[12px] text-fg-subtle py-3 text-center">추천 슬롯이 없습니다. 가용시간을 추가해 보세요.</div>}
      </div>
    </section>
  );
}
