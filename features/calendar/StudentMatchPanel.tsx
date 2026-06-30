"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ScheduleResources, ScheduleResource, ScheduleRow, AvailabilityBlock } from "@/types";
import type { ScheduleCreateBody } from "@/lib/api";
import { api } from "@/lib/api";
import { suggestPairSlots, type SlotCandidate } from "@/lib/domain/schedule";

const WD = ["일", "월", "화", "수", "목", "금", "토"];

// 좌측 패널: 오른쪽 '유저별 스케줄'에서 고른 학생 기준으로,
// 실제 수업(코스=과목·강사·진행시간)과 연동해 학생 일정에 맞는 수업·강사를 추천하고 바로 배정.
type CourseMatch = {
  courseId: number; courseName: string; subjectName: string;
  instructorId: number; instructorName?: string; durationMinutes: number; color?: string;
  freeSlots: number; sample: SlotCandidate[];
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

  // 후보 코스(과목 필터) → 각 코스의 실제 진행시간으로 학생∧강사 가용 슬롯 계산
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
        };
      })
      .filter((m) => m.freeSlots > 0)
      .sort((a, b) => b.freeSlots - a.freeSlots);
  }, [studentId, subject, weekStart, sessions, blocks, resources]);

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
            <p className="text-[12px] text-fg-subtle text-center py-4">
              맞는 수업이 없습니다.<br />학생/강사 가용시간을 확인해 보세요.
            </p>
          ) : (
            <div className="space-y-1">
              {matches.map((m) => (
                <div key={m.courseId} className="rounded border" style={{ borderColor: "var(--color-line)" }}>
                  <button
                    onClick={() => setOpenCourse(openCourse === m.courseId ? null : m.courseId)}
                    className="w-full flex items-center gap-2 px-2 h-9 text-[12px] hover:bg-canvas-subtle"
                  >
                    <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: m.color ?? "var(--color-accent)" }} />
                    <span className="flex-1 text-left min-w-0">
                      <span className="font-medium text-fg truncate block">{m.courseName}</span>
                      <span className="text-fg-subtle text-[11px]">{m.instructorName ?? `강사 ${m.instructorId}`} · {m.durationMinutes}분</span>
                    </span>
                    <span className="badge badge-accent" title="함께 비는 슬롯 수">{m.freeSlots}</span>
                  </button>
                  {openCourse === m.courseId && (
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
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
