"use client";
// [참조/처리] 출석부(/attendance, LMS형 — 피드백 2026-07-03). Moodle Attendance·대학 LMS 패턴:
//  행=학생 · 열=회차(날짜·분) 매트릭스, 셀 클릭=상태 순환(PUT /attendance 재사용), 열 헤더 클릭=일괄 출석,
//  행 끝 누적(출석/지각/결석·출석률·**누적 시수/총 시수 진도바**). 계산은 lib/domain/attendanceBook 단일 소스.
//  권한: 강사=본인 담당 코스만(마킹 가능) · 매니저/관리자=[학생 출석]+[강사 출석](강사 시수=teachingHours 재사용).
import { useMemo, useState } from "react";
import type { AttendanceStatus, ScheduleRow } from "@/types";
import { useSchedule, useAttendance, useUpsertAttendance, useStudents, useCourses } from "@/lib/queries";
import { buildAttendanceBook, hoursLabel, nextAttendanceStatus } from "@/lib/domain/attendanceBook";
import { teachingHours } from "@/lib/domain/schedule";
import { INSTRUCTOR_ATT_LABEL } from "@/lib/domain/lantiv";
import { useTacoStore } from "@/lib/store";
import { isAdmin } from "@/lib/roles";
import { SectionCard } from "@/components/ui";

// 상태 배지(셀) — LMS 관례: P/L/A/E 원형 + 색
const CELL: Record<AttendanceStatus, { label: string; bg: string }> = {
  present: { label: "출", bg: "var(--color-success)" },
  late: { label: "지", bg: "var(--color-attention)" },
  absent: { label: "결", bg: "var(--color-danger)" },
  excused: { label: "공", bg: "var(--color-fg-subtle)" },
};

const ymOf = (iso: string) => iso.slice(0, 7);
const thisYm = () => new Date().toISOString().slice(0, 7);

export function AttendanceBookView() {
  const role = useTacoStore((s) => s.currentRole);
  const manager = isAdmin(role);
  const { data: rows = [] } = useSchedule();
  const { data: attendance = [] } = useAttendance();
  const { data: students = [] } = useStudents();
  const { data: courses = [] } = useCourses();
  const upsert = useUpsertAttendance();

  const [tab, setTab] = useState<"student" | "instructor">("student");
  const [ym, setYm] = useState(thisYm());
  const [courseId, setCourseId] = useState<number | null>(null);

  // 강사=본인 담당 코스만(데모 규칙: 첫 강사 = 나 — 사이드바·캘린더와 동일)
  const myInstructorId = role === "instructor" ? Number(courses[0]?.instructorId ?? 1) : null;
  const visibleCourses = useMemo(
    () => (myInstructorId != null ? courses.filter((c) => Number(c.instructorId) === myInstructorId) : courses),
    [courses, myInstructorId],
  );
  const curCourse = visibleCourses.find((c) => Number(c.id) === courseId) ?? visibleCourses[0];

  // 이 코스·이 달의 세션들(회차) — useSchedule은 기본 조회(주간)라 넓게: rows에서 코스·월 필터
  const courseSessions = useMemo(
    () => rows.filter((r) => curCourse && Number(r.courseId) === Number(curCourse.id) && ymOf(r.sessionDate) === ym),
    [rows, curCourse, ym],
  );
  // 로스터 = 이 달 회차들의 코호트 합집합(코호트=enrollment 파생 studentIds — 무결성 단일 소스)
  const roster = useMemo(() => {
    const ids = new Set<number>();
    courseSessions.forEach((s) => (s.studentIds ?? []).forEach((id) => ids.add(Number(id))));
    return students
      .filter((st) => ids.has(Number(st.id)))
      .map((st) => ({ id: Number(st.id), name: st.name }));
  }, [courseSessions, students]);

  const book = useMemo(() => buildAttendanceBook(courseSessions as never, attendance, roster), [courseSessions, attendance, roster]);

  const mark = (sessionId: number, studentId: number, cur?: AttendanceStatus) =>
    upsert.mutate({ sessionId, studentId, status: nextAttendanceStatus(cur) });
  // 열 헤더 클릭 = 그 회차 전체 출석(Moodle 패턴 — 미체크·타상태 모두 present로)
  const markAll = (sessionId: number) => {
    const col = book.rows.filter((r) => r.cells.find((c) => c.sessionId === sessionId)?.inCohort);
    col.forEach((r) => upsert.mutate({ sessionId, studentId: r.studentId, status: "present" }));
  };

  const navYm = (d: number) => {
    const [y, m] = ym.split("-").map(Number);
    const nd = new Date(Date.UTC(y, m - 1 + d, 1));
    setYm(nd.toISOString().slice(0, 7));
  };

  // ── 강사 출석(매니저 전용): 행=강사, 열=이 달 진행 회차 날짜, 누적 강의 시수=teachingHours ──
  const instructorBook = useMemo(() => {
    if (!manager) return [];
    const held = rows.filter((r) => ymOf(r.sessionDate) === ym);
    const byInst = new Map<number, ScheduleRow[]>();
    held.forEach((r) => {
      const k = Number(r.instructorId);
      byInst.set(k, [...(byInst.get(k) ?? []), r]);
    });
    return [...byInst.entries()].map(([id, list]) => {
      const name = list[0]?.instructorName ?? `강사 ${id}`;
      const heldList = list.filter((r) => r.status === "held" || r.status === "makeup");
      const hrs = teachingHours(list as never, { instructorId: id, statuses: ["held", "makeup"] });
      return { id, name, sessions: [...heldList].sort((a, b) => a.sessionDate.localeCompare(b.sessionDate)), hours: hrs.hours };
    });
  }, [rows, ym, manager]);

  return (
    <div className="p-6 max-w-[1280px] mx-auto space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-title font-bold">출석부</h1>
          <p className="text-body text-fg-muted mt-0.5">
            회차별 출결 체크와 누적 시수 — 셀 클릭=상태 변경(출→지→결→공), 회차 헤더 클릭=전체 출석
          </p>
        </div>
        <div className="flex items-center gap-2">
          {manager && (
            <div className="flex rounded-md overflow-hidden border">
              {(["student", "instructor"] as const).map((t) => (
                <button key={t} className={`btn btn-sm rounded-none border-0 ${tab === t ? "badge-accent" : ""}`} onClick={() => setTab(t)}>
                  {t === "student" ? "학생 출석" : "강사 출석"}
                </button>
              ))}
            </div>
          )}
          <button className="btn btn-sm" onClick={() => navYm(-1)}>◀</button>
          <span className="mono text-body">{ym}</span>
          <button className="btn btn-sm" onClick={() => navYm(1)}>▶</button>
        </div>
      </div>

      {tab === "student" ? (
        <SectionCard
          title={`학생 출석 — ${curCourse?.name ?? "코스 없음"}`}
          action={
            <select
              className="input h-7 w-52 text-caption"
              value={curCourse ? Number(curCourse.id) : ""}
              onChange={(e) => setCourseId(Number(e.target.value))}
            >
              {visibleCourses.map((c) => (
                <option key={c.id} value={Number(c.id)}>{c.name}</option>
              ))}
            </select>
          }
        >
          {!book.columns.length ? (
            <p className="text-body text-fg-subtle py-6 text-center">{ym}에 이 코스의 회차가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table text-body">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-canvas z-10 min-w-[110px]">학생</th>
                    {book.columns.map((c) => (
                      <th key={c.sessionId} className="text-center min-w-[64px]">
                        <button
                          className={`block w-full ${c.held ? "hover:text-accent" : "opacity-60"}`}
                          title={c.held ? `${c.no}회차 전체 출석 처리` : "예정 회차(집계 제외)"}
                          onClick={() => c.held && markAll(c.sessionId)}
                        >
                          <div className="font-semibold">{c.no}회차</div>
                          <div className="mono text-[10.5px] text-fg-subtle">{c.date.slice(5)}</div>
                          <div className="mono text-[10px] text-fg-subtle">{c.durationMinutes}분{c.held ? "" : " · 예정"}</div>
                        </button>
                      </th>
                    ))}
                    <th className="text-center min-w-[76px]">출/지/결</th>
                    <th className="text-center min-w-[64px]">출석률</th>
                    <th className="min-w-[130px]">누적 시수</th>
                  </tr>
                </thead>
                <tbody>
                  {book.rows.map((r) => (
                    <tr key={r.studentId}>
                      <td className="sticky left-0 bg-canvas z-10 font-medium">{r.name}</td>
                      {r.cells.map((cell) => (
                        <td key={cell.sessionId} className="text-center">
                          {!cell.inCohort ? (
                            <span className="text-fg-subtle">–</span>
                          ) : (
                            <button
                              className="inline-grid place-items-center w-6 h-6 rounded-full text-micro font-semibold text-white disabled:opacity-40"
                              style={{ background: cell.status ? CELL[cell.status].bg : "var(--color-line)" }}
                              title={cell.held ? "클릭 = 출석→지각→결석→공결 순환" : "예정 회차 — 미리 체크 가능"}
                              onClick={() => mark(cell.sessionId, r.studentId, cell.status)}
                            >
                              {cell.status ? CELL[cell.status].label : ""}
                            </button>
                          )}
                        </td>
                      ))}
                      <td className="text-center mono">
                        <span className="text-success">{r.counts.present}</span>/
                        <span className="text-attention">{r.counts.late}</span>/
                        <span className="text-danger">{r.counts.absent}</span>
                      </td>
                      <td className="text-center mono">{r.rate == null ? "—" : `${r.rate}%`}</td>
                      <td>
                        {/* 누적 시수 진도바 — 인정(출석·지각) 분 / 진행 회차 총 분 */}
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-2 rounded-full overflow-hidden bg-line-muted">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${r.totalMinutes ? Math.min(100, (r.attendedMinutes / r.totalMinutes) * 100) : 0}%`,
                                background: "var(--color-accent)",
                              }}
                            />
                          </div>
                          <span className="mono text-micro whitespace-nowrap">
                            {hoursLabel(r.attendedMinutes)}/{hoursLabel(r.totalMinutes)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-caption text-fg-subtle mt-2">
            시수 인정: 출석·지각 = 회차 시간 인정 · 결석·공결·미체크 = 0 (강사 정산 시수 규칙과 대칭). 예정 회차는 집계 제외.
          </p>
        </SectionCard>
      ) : (
        <SectionCard title={`강사 출석 — ${ym} 진행 회차`}>
          {!instructorBook.length ? (
            <p className="text-body text-fg-subtle py-6 text-center">{ym}에 진행된 회차가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table text-body">
                <thead>
                  <tr>
                    <th className="min-w-[110px]">강사</th>
                    <th>진행 회차(날짜 · 강사 출결)</th>
                    <th className="text-center min-w-[90px]">진행 수</th>
                    <th className="text-center min-w-[110px]">누적 강의 시수</th>
                  </tr>
                </thead>
                <tbody>
                  {instructorBook.map((r) => (
                    <tr key={r.id}>
                      <td className="font-medium">{r.name}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {r.sessions.map((s) => (
                            <span key={s.id} className="badge text-[10.5px] mono" title={`${s.courseName} ${s.startTime ?? ""}`}>
                              {s.sessionDate.slice(5)} {s.instructorAttendance ? INSTRUCTOR_ATT_LABEL[s.instructorAttendance] : "—"}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="text-center mono">{r.sessions.length}회</td>
                      <td className="text-center mono font-semibold">{r.hours}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-caption text-fg-subtle mt-2">
            누적 강의 시수는 정산(강사 페이)과 동일한 teachingHours 규칙(진행·보강 회차) — 숫자 불일치가 없습니다.
          </p>
        </SectionCard>
      )}
    </div>
  );
}
