"use client";
// [참조/처리] 출석부(/attendance, LMS형 — 피드백 2026-07-03). Moodle Attendance·대학 LMS 패턴:
//  행=학생 · 열=회차(날짜·분) 매트릭스, 셀 클릭=상태 순환(PUT /attendance 재사용), 열 헤더 클릭=일괄 출석,
//  행 끝 누적(출석/지각/결석·출석률·**누적 시수/총 시수 진도바**). 계산은 lib/domain/attendanceBook 단일 소스.
//  권한: 강사=본인 담당 코스만(마킹 가능) · 매니저/관리자=[학생 출석]+[강사 출석](강사 시수=teachingHours 재사용).
import { useMemo, useState } from "react";
import type { AttendanceStatus, InstructorAttendanceStatus, ScheduleRow } from "@/types";
import { useSchedule, useAttendance, useUpsertAttendance, useStudents, useCourses, useUpdateSchedule } from "@/lib/queries";
import { buildAttendanceBook, hoursLabel, nextAttendanceStatus } from "@/lib/domain/attendanceBook";
import { paidTeachingHours } from "@/lib/domain/schedule";
import { INSTRUCTOR_ATT_LABEL } from "@/lib/domain/lantiv";
import { useTacoStore } from "@/lib/store";
import { isAdmin } from "@/lib/roles";
import { myInstructorId as loginInstructorId } from "@/lib/auth";
import { EmptyState, HelpPopover, PageHeader, SectionCard, TableWrap } from "@/components/ui";

// 상태 배지(셀) — LMS 관례: P/L/A/E 원형 + 색
const CELL: Record<AttendanceStatus, { label: string; bg: string }> = {
  present: { label: "출", bg: "var(--color-success)" },
  late: { label: "지", bg: "var(--color-attention)" },
  absent: { label: "결", bg: "var(--color-danger)" },
  excused: { label: "공", bg: "var(--color-fg-subtle)" },
};

// [TBO-19] 강사 출결 선택 순서(매니저 편집 select).
const INSTRUCTOR_ATT_ORDER: InstructorAttendanceStatus[] = ["present", "late", "absent", "makeup"];

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
  // [TBO-19] 강사 출결 마킹(매니저 CRUD) — 세션 PATCH(manager+ 게이트)로 저장, 강사는 API상 read-only.
  const updateSchedule = useUpdateSchedule();

  const [tab, setTab] = useState<"student" | "instructor">("student");
  const [ym, setYm] = useState(thisYm());
  const [courseId, setCourseId] = useState<number | null>(null);

  // [TBO-19] 로그인 강사의 도메인 강사 id(=JWT sub, 강사 식별자 통일 2026-07-07). 미링크 시 첫 코스 강사 폴백.
  const myInstId = role === "instructor" ? (loginInstructorId() ?? Number(courses[0]?.instructorId ?? 1)) : null;
  const visibleCourses = useMemo(
    () => (myInstId != null ? courses.filter((c) => Number(c.instructorId) === myInstId) : courses),
    [courses, myInstId],
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

  // ── 강사 출석: 행=강사, 열=이 달 진행 회차. **매니저=전 강사 편집(CRUD)**, **강사=본인만 읽기**. ──
  //  [TBO-19] 강사는 API상 세션 PATCH가 manager+ 게이트라 자동 read-only(UI도 select 대신 배지).
  const canEditInstructorAtt = manager; // 매니저/관리자만 강사 출결 마킹
  const instructorBook = useMemo(() => {
    // 강사 본인 스코프(manager는 전체). 강사인데 id 미해석이면 빈 목록.
    if (!manager && myInstId == null) return [];
    const held = rows.filter((r) => ymOf(r.sessionDate) === ym && (manager || Number(r.instructorId) === myInstId));
    const byInst = new Map<number, ScheduleRow[]>();
    held.forEach((r) => {
      const k = Number(r.instructorId);
      byInst.set(k, [...(byInst.get(k) ?? []), r]);
    });
    return [...byInst.entries()].map(([id, list]) => {
      const name = list[0]?.instructorName ?? `강사 ${id}`;
      // [TBO-19] 진행 회차 표시는 held·makeup 모두(출결 마킹 대상), 시수는 정산 규칙(countsForPay=held·비결석)만.
      const heldList = list.filter((r) => r.status === "held" || r.status === "makeup");
      const hrs = paidTeachingHours(list as never, { instructorId: id });
      return { id, name, sessions: [...heldList].sort((a, b) => a.sessionDate.localeCompare(b.sessionDate)), hours: hrs.hours };
    });
  }, [rows, ym, manager, myInstId]);

  // [TBO-19] 강사 출결 저장(매니저) — 세션 PATCH. 성공 시 schedule·reports·payouts 무효화(useUpdateSchedule).
  const markInstructor = (sessionId: number, status: InstructorAttendanceStatus) =>
    updateSchedule.mutate({ id: sessionId, body: { instructorAttendance: status } });

  return (
    <div className="p-6 max-w-page-wide mx-auto space-y-4">
      <PageHeader
        title="출석부"
        sub="회차별 출결 체크와 누적 시수"
        actions={
          <>
            {/* [TBO-19] 강사도 '내 출석' 탭 접근(본인 읽기 전용). 매니저는 '강사 출석'(전 강사 편집). */}
            {(manager || role === "instructor") && (
              <div className="flex rounded-md overflow-hidden border">
                {(["student", "instructor"] as const).map((t) => (
                  <button key={t} className={`btn btn-sm rounded-none border-0 ${tab === t ? "badge-accent" : ""}`} onClick={() => setTab(t)}>
                    {t === "student" ? "학생 출석" : manager ? "강사 출석" : "내 출석"}
                  </button>
                ))}
              </div>
            )}
            <button className="btn btn-sm" onClick={() => navYm(-1)}>◀</button>
            <span className="mono text-body">{ym}</span>
            <button className="btn btn-sm" onClick={() => navYm(1)}>▶</button>
            {/* [DESIGN §5.5] 조작 설명은 부제가 아니라 ⓘ 팝오버 */}
            <HelpPopover title="출석부 사용법">
              <p>셀 클릭 = 상태 변경(출→지→결→공 순환)</p>
              <p>회차 헤더 클릭 = 해당 회차 전체 출석</p>
              <p>시수 인정: 출석·지각만 인정(정산 규칙과 대칭)</p>
            </HelpPopover>
          </>
        }
      />

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
            <EmptyState message={`${ym}에 이 코스의 회차가 없습니다.`} />
          ) : (
            <TableWrap>
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
            </TableWrap>
          )}
          <p className="text-caption text-fg-subtle mt-2">
            시수 인정: 출석·지각 = 회차 시간 인정 · 결석·공결·미체크 = 0 (강사 정산 시수 규칙과 대칭). 예정 회차는 집계 제외.
          </p>
        </SectionCard>
      ) : (
        <SectionCard title={`${manager ? "강사 출석" : "내 출석"} — ${ym} 진행 회차`}>
          {!instructorBook.length ? (
            <EmptyState message={`${ym}에 진행된 회차가 없습니다.`} />
          ) : (
            <TableWrap>
              <table className="table text-body">
                <thead>
                  <tr>
                    <th className="min-w-[110px]">강사</th>
                    <th>진행 회차(날짜 · 강사 출결{canEditInstructorAtt ? " · 클릭 변경" : ""})</th>
                    <th className="text-center min-w-[90px]">진행 수</th>
                    <th className="text-center min-w-[110px]">누적 강의 시수</th>
                  </tr>
                </thead>
                <tbody>
                  {instructorBook.map((r) => (
                    <tr key={r.id}>
                      <td className="font-medium">{r.name}</td>
                      <td>
                        <div className="flex flex-wrap gap-1.5">
                          {r.sessions.map((s) =>
                            canEditInstructorAtt ? (
                              // 매니저: 출결 편집(set/change) — 세션 PATCH. '미표시'는 값 유지(초기화는 후속).
                              <label key={s.id} className="inline-flex items-center gap-1 badge text-[10.5px]" title={`${s.courseName} ${s.startTime ?? ""}`}>
                                <span className="mono">{s.sessionDate.slice(5)}</span>
                                <select
                                  className="input h-6 px-1 py-0 text-[10.5px]"
                                  value={s.instructorAttendance ?? ""}
                                  disabled={updateSchedule.isPending}
                                  onChange={(e) => e.target.value && markInstructor(s.id, e.target.value as InstructorAttendanceStatus)}
                                >
                                  <option value="">미표시</option>
                                  {INSTRUCTOR_ATT_ORDER.map((st) => (
                                    <option key={st} value={st}>{INSTRUCTOR_ATT_LABEL[st]}</option>
                                  ))}
                                </select>
                              </label>
                            ) : (
                              // 강사: 본인 출결 읽기 전용 배지
                              <span key={s.id} className="badge text-[10.5px] mono" title={`${s.courseName} ${s.startTime ?? ""}`}>
                                {s.sessionDate.slice(5)} {s.instructorAttendance ? INSTRUCTOR_ATT_LABEL[s.instructorAttendance] : "—"}
                              </span>
                            ),
                          )}
                        </div>
                      </td>
                      <td className="text-center mono">{r.sessions.length}회</td>
                      <td className="text-center mono font-semibold">{r.hours}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
          <p className="text-caption text-fg-subtle mt-2">
            {canEditInstructorAtt
              ? "매니저: 회차별 강사 출결을 직접 변경합니다(출석/지각/결석/보강). "
              : "본인 출결은 읽기 전용입니다. 정정이 필요하면 매니저에게 요청하세요. "}
            <b>시수 인정</b>: 진행(held)이고 강사 결석 아님만 — <b>미진행·보강·결석은 제외</b>(정산과 동일 규칙, 잠정).
          </p>
        </SectionCard>
      )}
    </div>
  );
}
