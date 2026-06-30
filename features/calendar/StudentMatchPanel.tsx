"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ScheduleResources, ScheduleResource, ScheduleRow, AvailabilityBlock } from "@/types";
import { api } from "@/lib/api";
import { recommendInstructorsForStudent, type InstructorMatch } from "@/lib/domain/schedule";

// 좌측 패널: 오른쪽 "유저별 스케줄"에서 고른 학생을 기준으로,
// 그 학생 스케줄과 안 겹치는(가용 교집합이 있는) 강사를 추천. 과목 선택 가능.
export function StudentMatchPanel({
  resources, weekStart, sessions, selected, onAssign,
}: {
  resources: ScheduleResources;
  weekStart: string;
  sessions: ScheduleRow[];
  selected: ScheduleResource | null;
  onAssign: () => void; // 배정 드로어 열기(선택 학생 기준)
}) {
  const [subject, setSubject] = useState<string>("");
  const [dur, setDur] = useState(90);
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);

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

  const candidateInstructors = useMemo(
    () =>
      resources.instructors
        .filter((i) => !subject || i.sub === subject)
        .map((i) => ({ id: i.id, name: i.name, subjectName: i.sub, color: i.color })),
    [resources, subject],
  );

  const matches = useMemo<InstructorMatch[]>(() => {
    if (studentId == null) return [];
    return recommendInstructorsForStudent(
      { weekStart, durationMinutes: dur, studentId, instructors: candidateInstructors },
      { sessions, blocks },
    );
  }, [studentId, weekStart, dur, candidateInstructors, sessions, blocks]);

  return (
    <aside className="w-60 shrink-0 card overflow-hidden self-start sticky top-4">
      <div className="px-3 h-10 flex items-center border-b" style={{ borderColor: "var(--color-line)" }}>
        <span className="text-[13px] font-semibold">학생 → 강사 추천</span>
      </div>

      {studentId == null ? (
        <p className="text-[12px] text-fg-subtle text-center px-3 py-8 leading-relaxed">
          오른쪽 <b>유저별 스케줄</b>에서<br />학생을 선택하면<br />일정이 맞는 강사를 추천합니다.
        </p>
      ) : (
        <div className="p-2 space-y-2">
          <div className="text-[12px] text-fg-muted px-1">
            <span className="text-accent font-semibold">{studentName}</span> 기준 추천
          </div>
          <div className="flex items-center gap-1.5 text-[12px]">
            <select className="input h-7 flex-1" value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">전체 과목</option>
              {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="input h-7 w-16" value={dur} onChange={(e) => setDur(Number(e.target.value))}>
              {[60, 90, 120].map((d) => <option key={d} value={d}>{d}분</option>)}
            </select>
          </div>

          {matches.length === 0 ? (
            <p className="text-[12px] text-fg-subtle text-center py-4">
              겹치지 않는 강사가 없습니다.<br />가용시간을 추가해 보세요.
            </p>
          ) : (
            <div className="space-y-1">
              {matches.map((m) => (
                <button
                  key={m.instructorId}
                  onClick={onAssign}
                  title={m.sample.map((s) => `${s.date.slice(5)} ${s.startTime}–${s.endTime}`).join("\n")}
                  className="w-full flex items-center gap-2 rounded border px-2 h-9 text-[12px] hover:bg-canvas-subtle"
                  style={{ borderColor: "var(--color-line)" }}
                >
                  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: m.color ?? "var(--color-accent)" }} />
                  <span className="flex-1 text-left truncate text-fg font-medium">{m.instructorName ?? `강사 ${m.instructorId}`}</span>
                  {m.subjectName && <span className="text-[11px] text-fg-subtle">{m.subjectName}</span>}
                  <span className="badge badge-accent" title="겹치는 가용 슬롯 수">{m.freeSlots}</span>
                </button>
              ))}
              <p className="text-[11px] text-fg-subtle pt-0.5">숫자 = 함께 비는 후보 슬롯. 클릭 시 배정 화면.</p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
