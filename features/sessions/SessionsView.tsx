"use client";
// [B6 C3 2026-07-16] 행 전체 클릭 = 상세 진입(ClickableTableRow href) — 셀 native <a>는 Link로 교체.
import { useState } from "react";
import Link from "next/link";
import { Badge, ClickableTableRow, SectionCard, PageHeader, EmptyState, LoadingState, TableWrap, type Tone } from "@/components/ui";
import { useSchedule, useCourses, useInstructors } from "@/lib/queries";
import { useAccountAccess } from "@/lib/useAccountAccess";
import type { SessionStatus } from "@/types";
import { shortDate } from "@/lib/format";
import { SessionForm } from "./SessionForm";

const tone: Record<SessionStatus, Tone> = {
  scheduled: "accent",
  held: "success",
  canceled: "danger",
  no_show: "attention",
  makeup: "done",
};
const label: Record<SessionStatus, string> = {
  scheduled: "예정",
  held: "진행완료",
  canceled: "취소",
  no_show: "결석",
  makeup: "보강",
};

export function SessionsView() {
  // [권한 정합] 수업 직접 개설(POST /schedule)은 BE ADMIN 전용 → 매니저 이상만 폼 노출(강사=403 방지).
  //  강사는 캘린더의 수업요청(schedule-requests) 경로로 개설.
  const admin = useAccountAccess().can("calendar.manage");
  const { data: classSessions = [], isPending: loading } = useSchedule(); // [E0.6 H2]
  const { data: courses = [] } = useCourses();
  const { data: instructors = [] } = useInstructors();

  const [q, setQ] = useState("");
  const kw = q.trim().toLowerCase();
  const rows = classSessions.filter((cs) => {
    if (!kw) return true;
    const course = courses.find((c) => c.id === cs.courseId)?.name ?? "";
    const instructor = instructors.find((i) => i.id === cs.instructorId)?.name ?? "";
    return [course, instructor, cs.topic ?? "", cs.sessionDate].some((v) => v.toLowerCase().includes(kw));
  });

  return (
    <div className="p-6 max-w-page mx-auto space-y-6">
      <PageHeader title="수업 (강사)" sub="진행 수업 목록 · 출석·피드백은 상세에서" />

      {admin && (
        <SectionCard title="신규 수업 개설">
          <SessionForm />
        </SectionCard>
      )}

      <SectionCard
        title={`수업 목록 (${rows.length})`}
        action={
          <input
            className="input w-56 h-7"
            placeholder="코스·강사·주제·날짜 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        }
      >
        {loading ? (
          <LoadingState />
        ) : rows.length === 0 ? (
          <EmptyState message={kw ? '검색 결과가 없습니다.' : '수업이 없습니다.'} />
        ) : (
        <TableWrap>
        <table className="table">
          <thead>
            <tr>
              <th>날짜</th>
              <th>코스</th>
              <th>강사</th>
              <th>주제</th>
              <th>상태</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((cs) => {
              const course = courses.find((c) => c.id === cs.courseId);
              const instructor = instructors.find((i) => i.id === cs.instructorId);
              return (
                <ClickableTableRow
                  key={cs.id}
                  href={`/sessions/${cs.id}`}
                  label={`${shortDate(cs.sessionDate)} ${course?.name ?? "수업"} 상세 · 출석`}
                >
                  <td className="mono">{shortDate(cs.sessionDate)}</td>
                  <td className="font-medium">{course?.name ?? "—"}</td>
                  <td className="text-fg-muted">{instructor?.name ?? "—"}</td>
                  <td className="text-fg-muted">{cs.topic ?? "—"}</td>
                  <td>
                    <Badge tone={tone[cs.status]}>{label[cs.status]}</Badge>
                  </td>
                  <td className="text-right">
                    <Link href={`/sessions/${cs.id}`} className="btn btn-sm">
                      상세 · 출석
                    </Link>
                  </td>
                </ClickableTableRow>
              );
            })}
          </tbody>
        </table>
        </TableWrap>
        )}
      </SectionCard>
    </div>
  );
}
