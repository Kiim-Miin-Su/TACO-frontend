"use client";
// [참조/처리] 참여 인원 카드(피드백 2026-07-03) — 스케줄(수업)을 선택하면 그 스케줄에 포함된
//  인원(강사+학생 코호트)이 우측에 리스트로 뜨고, 한 명을 고르면 **바로 아래에 유저 상세 카드**
//  (ResourceDetailCard — 학생은 국가·상태 즉시 수정)가 열린다. 데이터·라벨은 전부 단일 소스 재사용:
//  코호트=ScheduleRow.studentIds(명시 v0.1.13 우선·코스 파생 폴백), 국기=CountryBadge, 상태=STUDENT_STATUS_LABEL.
import type { ScheduleResource, ScheduleRow } from "@/types";
import { useStudents, useInstructors } from "@/lib/queries";
import { CountryBadge } from "./CountryInput";
import { studentGradeLabel, STUDENT_STATUS_LABEL } from "@/lib/domain/students";

export function ParticipantsCard({
  row, picked, onPick,
}: {
  row: ScheduleRow;
  picked: ScheduleResource | null; // 현재 열린 유저(하이라이트)
  onPick: (r: ScheduleResource) => void; // 클릭 = 유저 상세 카드(뷰 불변 — infoTarget)
}) {
  const { data: students = [] } = useStudents();
  const { data: instructors = [] } = useInstructors();
  const inst = instructors.find((i) => Number(i.id) === Number(row.instructorId));

  const rowBtn = (r: ScheduleResource, sub: React.ReactNode) => {
    const on = picked?.type === r.type && Number(picked.id) === Number(r.id);
    return (
      <button
        key={`${r.type}-${r.id}`}
        className={`w-full flex items-center gap-2 px-2 h-8 rounded text-body text-left ${on ? "bg-neutral-subtle font-semibold" : "hover:bg-canvas-subtle"}`}
        onClick={() => onPick(r)}
        title={`${r.name} 상세 정보 보기${r.type === "student" ? "·수정" : ""}`}
      >
        <span className="badge text-[10px] shrink-0">{r.type === "instructor" ? "강사" : "학생"}</span>
        <span className="flex-1 truncate">{r.name}</span>
        <span className="text-micro text-fg-subtle shrink-0">{sub}</span>
      </button>
    );
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-3 h-9 flex items-center justify-between border-b">
        <span className="text-body font-semibold">이 수업 참여 인원</span>
        <span className="text-micro text-fg-subtle">{1 + (row.studentIds?.length ?? 0)}명</span>
      </div>
      <div className="p-1.5 space-y-0.5">
        {rowBtn(
          { type: "instructor", id: Number(row.instructorId), name: row.instructorName } as ScheduleResource,
          inst?.subjectName ?? "",
        )}
        {(row.studentIds ?? []).map((sid, i) => {
          const st = students.find((x) => Number(x.id) === Number(sid));
          const name = row.studentNames?.[i] ?? st?.name ?? `학생 ${sid}`;
          return rowBtn(
            { type: "student", id: Number(sid), name } as ScheduleResource,
            st ? (
              <span className="inline-flex items-center gap-1">
                <CountryBadge code={st.country} />
                {st.grade != null && <span>{studentGradeLabel(st.grade)}</span>}
                <span style={{ color: st.status !== "enrolled" ? "var(--color-attention)" : undefined }}>
                  {STUDENT_STATUS_LABEL[st.status] ?? st.status}
                </span>
              </span>
            ) : "",
          );
        })}
      </div>
    </div>
  );
}
