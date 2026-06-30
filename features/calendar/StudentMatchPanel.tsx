"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ScheduleResources, ScheduleResource, ScheduleRow, AvailabilityBlock } from "@/types";
import type { ScheduleCreateBody } from "@/lib/api";
import { api } from "@/lib/api";
import { suggestPairSlots, ownerWindows, type SlotCandidate } from "@/lib/domain/schedule";

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const WORKDAYS = [1, 2, 3, 4, 5];

// 좌측 패널: 오른쪽 '유저별 스케줄'에서 고른 학생 기준으로,
// 실제 수업(코스=과목·강사·진행시간)과 연동해 학생 일정에 맞는 수업·강사를 추천하고 바로 배정.
// 맞는 슬롯이 없으면 "누가·어떤 과목·어떻게" 불가한지 사유를 함께 보여준다.
type CourseMatch = {
  courseId: number; courseName: string; subjectName: string;
  instructorId: number; instructorName?: string; durationMinutes: number; color?: string;
  freeSlots: number; sample: SlotCandidate[]; reason?: string;
};

export function StudentMatchPanel({
  resources, weekStart, sessions, selected, onAssign,
}: {
  resources: ScheduleResources;
  weekStart: string;
  sessions: ScheduleRow[];
  selected: ScheduleResource | null;
  onAssign: (body: ScheduleCreateBody) => void;
}) {
  const [subject, setSubject] = useState<string>("");
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [openCourse, setOpenCourse] = useState<number | null>(null);

  const loadBlocks = useCallback(() => {
    api.availability.all().then(setBlocks).catch(() => setBlocks([]));
  }, []);
  useEffect(() => { loadBlocks(); }, [loadBlocks]);

  const studentId = selected?.type === "student" ? selected.id : null;
  const studentName = selected?.type === "student" ? selected.name : null;

  const subjects = useMemo(() => {
    const s = new Set<string>();
    resources.courses.forEach((c) => c.subjectName && s.add(c.subjectName));
    return [...s];
  }, [resources]);

  // 불가 사유: 누가(강사/학생)·어떻게(불가시간/가용 불일치/점유)
  const reasonFor = useCallback((instructorId: number, instructorName?: string): string => {
    if (studentId == null) return "";
    const fmt = (bs: AvailabilityBlock[]) => {
      const m = new Map<string, number[]>();
      bs.forEach((b) => { const k = `${b.startTime}-${b.endTime}`; m.set(k, [...(m.get(k) ?? []), b.weekday]); });
      return [...m.entries()].map(([t, wds]) => `${wds.sort().map((d) => WD[d]).join("·")} ${t.replace("-", "–")}`).join(", ");
    };
    const instUn = blocks.filter((b) => b.ownerType === "instructor" && b.ownerId === instructorId && b.kind === "unavailable");
    const studUn = blocks.filter((b) => b.ownerType === "student" && b.ownerId === studentId && b.kind === "unavailable");
    const instAv = ownerWindows(blocks, "instructor", instructorId, "available");
    const studAv = ownerWindows(blocks, "student", studentId, "available");
    // 양쪽 다 가용대를 정의했는데 겹치는 요일·시간이 없음
    if (instAv.length && studAv.length) {
      const overlap = WORKDAYS.some((d) => {
        const a = instAv.filter((w) => w.weekday === d), b = studAv.filter((w) => w.weekday === d);
        return a.some((x) => b.some((y) => x.start < y.end && y.start < x.end));
      });
      if (!overlap) return `가용 시간대 불일치 — ${instructorName ?? "강사"}·${studentName} 가능 시간이 안 겹침`;
    }
    const parts: string[] = [];
    if (instUn.length) parts.push(`${instructorName ?? "강사"} 불가시간 (${fmt(instUn)})`);
    if (studUn.length) parts.push(`${studentName} 불가시간 (${fmt(studUn)})`);
    if (parts.length) return parts.join(" · ");
    // 학생 본인이 그 강사 시간대에 이미 수업 중인지
    const studBusy = sessions.some((s) => (s.studentIds ?? []).includes(studentId));
    return studBusy ? "빈 시간 없음 — 기존 수업으로 점유됨" : "빈 시간 없음 — 가용시간을 추가해 보세요";
  }, [blocks, sessions, studentId, studentName]);

  // 후보 코스(과목 필터) → 각 코스의 실제 진행시간으로 학생∧강사 가용 슬롯 계산. 0슬롯은 사유 포함.
  const matches = useMemo<CourseMatch[]>(() => {
    if (studentId == null) return [];
    return resources.courses
      .filter((c) => !subject || c.subjectName === subject)
      .map((c) => {
        const slots = suggestPairSlots(
          { weekStart, durationMinutes: c.durationMinutes, instructorId: c.instructorId, studentId },
          { sessions, blocks, limit: 30 },
        );
        return {
          courseId: c.id, courseName: c.name, subjectName: c.subjectName,
          instructorId: c.instructorId, instructorName: c.instructorName, durationMinutes: c.durationMinutes, color: c.color,
          freeSlots: slots.length, sample: slots.slice(0, 4),
          reason: slots.length === 0 ? reasonFor(c.instructorId, c.instructorName) : undefined,
        };
      })
      .sort((a, b) => b.freeSlots - a.freeSlots);
  }, [studentId, subject, weekStart, sessions, blocks, resources, reasonFor]);

  return (
    <aside className="w-60 shrink-0 card overflow-hidden self-start sticky top-4">
      <div className="px-3 h-10 flex items-center border-b" style={{ borderColor: "var(--color-line)" }}>
        <span className="text-[13px] font-semibold">학생 → 수업·강사 추천</span>
      </div>

      {studentId == null ? (
        <p className="text-[12px] text-fg-subtle text-center px-3 py-8 leading-relaxed">
          오른쪽 <b>유저별 스케줄</b>에서<br />학생을 선택하면<br />일정에 맞는 수업·강사를 추천합니다.
        </p>
      ) : (
        <div className="p-2 space-y-2">
          <div className="text-[12px] text-fg-muted px-1">
            <span className="text-accent font-semibold">{studentName}</span> 기준 · 실제 수업 연동
          </div>
          <select className="input h-7 w-full text-[12px]" value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">전체 과목</option>
            {subjects.map((sname) => <option key={sname} value={sname}>{sname}</option>)}
          </select>

          {matches.length === 0 ? (
            <p className="text-[12px] text-fg-subtle text-center py-4">후보 수업이 없습니다.</p>
          ) : (
            <div className="space-y-1">
              {matches.map((m) => {
                const ok = m.freeSlots > 0;
                return (
                  <div key={m.courseId} className="rounded border" style={{ borderColor: "var(--color-line)" }}>
                    <button
                      onClick={() => ok && setOpenCourse(openCourse === m.courseId ? null : m.courseId)}
                      className={`w-full flex items-center gap-2 px-2 min-h-9 py-1 text-[12px] ${ok ? "hover:bg-canvas-subtle" : "opacity-90 cursor-default"}`}
                    >
                      <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ok ? (m.color ?? "var(--color-accent)") : "var(--color-line)" }} />
                      <span className="flex-1 text-left min-w-0">
                        <span className="font-medium text-fg truncate block">{m.courseName} <span className="text-fg-subtle font-normal">· {m.subjectName}</span></span>
                        <span className="text-fg-subtle text-[11px]">{m.instructorName ?? `강사 ${m.instructorId}`} · {m.durationMinutes}분</span>
                        {!ok && m.reason && <span className="block text-[11px] mt-0.5" style={{ color: "var(--color-attention)" }}>⚠ {m.reason}</span>}
                      </span>
                      {ok
                        ? <span className="badge badge-accent" title="함께 비는 슬롯 수">{m.freeSlots}</span>
                        : <span className="badge" title="배정 가능한 시간 없음">불가</span>}
                    </button>
                    {ok && openCourse === m.courseId && (
                      <div className="px-2 pb-2 pt-0.5 space-y-1 border-t" style={{ borderColor: "var(--color-line-muted)" }}>
                        <div className="text-[11px] text-fg-subtle pt-1">배정할 시간 선택:</div>
                        {m.sample.map((s, i) => (
                          <button
                            key={i}
                            onClick={() => onAssign({ courseId: m.courseId, instructorId: m.instructorId, sessionDate: s.date, startTime: s.startTime, endTime: s.endTime })}
                            className="w-full text-left rounded px-2 h-7 text-[12px] mono hover:bg-canvas-subtle border"
                            style={{ borderColor: "var(--color-line)" }}
                          >
                            {WD[s.weekday]} {s.date.slice(5)} · {s.startTime}–{s.endTime}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
