"use client";
// [참조/처리] 우측 유저 상세·편집 카드(피드백 2026-07-03 #2·#3) — ResourcePanel에서 유저를 고르면
//  "개인 스케줄 필터"(상단 버튼과 중복이던 기능)에 더해 **그 유저의 상세정보와 즉시 편집**을 제공한다.
//  학생: 국가·거주·상태·학년·연락처 수정(PATCH /students/:id) — 해외 학생의 출국/입국, 갑작스런
//  휴원/그만둠을 캘린더를 벗어나지 않고 반영. 국가 변경은 시차 뷰·국가 필터에 즉시 반영(invalidate).
//  강사/강의실: 읽기 요약. 퇴원(수강 동반 정리)은 학생 탭의 퇴원 처리 흐름 안내(무결성 — remove 경로).
import { useEffect, useState } from "react";
import type { ScheduleResource, Student } from "@/types";
import { useStudents, useEnrollments, useCourses, useUpdateStudent } from "@/lib/queries";
import { COUNTRIES } from "@/lib/domain/tz";
import { CountryBadge } from "./CountryInput";
import { STUDENT_STATUS_LABEL as STATUS_LABEL } from "@/lib/domain/students"; // 상태 라벨 단일 소스


export function ResourceDetailCard({ selected, onMsg }: { selected: ScheduleResource; onMsg: (m: string) => void }) {
  const { data: students = [] } = useStudents();
  const { data: enrollments = [] } = useEnrollments();
  const { data: courses = [] } = useCourses();
  const updateStudent = useUpdateStudent();

  const student: Student | undefined =
    selected.type === "student" ? students.find((s) => Number(s.id) === Number(selected.id)) : undefined;

  // 편집 폼(학생) — 선택 변경 시 서버 값으로 리셋
  const [f, setF] = useState({ country: "KR", residenceType: "domestic", status: "active", grade: "", phone: "" });
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    setEditing(false);
    if (student)
      setF({
        country: (student.country ?? "KR").toUpperCase(),
        residenceType: student.residenceType ?? "domestic",
        status: student.status,
        grade: student.grade != null ? String(student.grade) : "",
        phone: student.phone ?? "",
      });
  }, [student?.id, student?.country, student?.residenceType, student?.status, student?.grade, student?.phone]);

  if (selected.type === "instructor" || selected.type === "room") {
    return (
      <div className="card card-pad text-[12.5px] space-y-1">
        <div className="font-semibold text-[13px]">{selected.name}</div>
        <div className="text-fg-muted">{selected.type === "instructor" ? `강사${selected.sub ? ` · ${selected.sub}` : ""}` : "강의실"}</div>
        <p className="text-[11.5px] text-fg-subtle">위 캘린더가 이 {selected.type === "instructor" ? "강사" : "강의실"}의 개인 스케줄로 필터링됩니다.</p>
      </div>
    );
  }
  if (!student) return null;

  const myCourses = enrollments
    .filter((e) => Number(e.studentId) === Number(student.id) && e.status === "active")
    .map((e) => courses.find((c) => Number(c.id) === Number(e.courseId))?.name ?? `코스 ${e.courseId}`);

  const save = () => {
    updateStudent.mutate(
      {
        id: Number(student.id),
        patch: {
          country: f.country.split("-")[0], // US-W 표시 변형 → 저장은 US
          residenceType: f.residenceType as Student["residenceType"],
          status: f.status as Student["status"],
          grade: f.grade ? Number(f.grade) : undefined,
          phone: f.phone || undefined,
        },
      },
      {
        onSuccess: () => { setEditing(false); onMsg(`${student.name} 정보를 수정했습니다`); },
        onError: () => onMsg("학생 정보 수정 실패"),
      },
    );
  };

  return (
    <div className="card card-pad text-[12.5px] space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-semibold text-[13px]">{student.name}</span>
          {student.englishName && <span className="ml-1 text-fg-subtle text-[11px]">{student.englishName}</span>}
        </div>
        {!editing && (
          <button className="btn btn-sm h-6" onClick={() => setEditing(true)} title="국가(출국/입국)·상태(휴원 등)·학년·연락처 수정">
            정보 수정
          </button>
        )}
      </div>
      {!editing ? (
        <dl className="grid grid-cols-[52px_1fr] gap-y-1">
          <dt className="text-fg-muted">국가</dt>
          <dd><CountryBadge code={student.country} showName /> {student.residenceType === "overseas" && <span className="badge text-[10px]">해외 거주</span>}</dd>
          <dt className="text-fg-muted">상태</dt>
          <dd>{STATUS_LABEL[student.status] ?? student.status}</dd>
          <dt className="text-fg-muted">학년</dt>
          <dd>{student.grade ?? "—"}</dd>
          <dt className="text-fg-muted">수강</dt>
          <dd>{myCourses.length ? myCourses.join(", ") : "—"}</dd>
        </dl>
      ) : (
        <div className="space-y-1.5">
          <label className="block">
            <span className="text-[11px] text-fg-muted">국가 (출국/입국 시 변경 — 캘린더 시차에 즉시 반영)</span>
            <select className="input h-7 w-full text-[12px]" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>
              {COUNTRIES.map((c) => (<option key={c.code} value={c.code}>{c.flag} {c.name}</option>))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="block">
              <span className="text-[11px] text-fg-muted">거주</span>
              <select className="input h-7 w-full text-[12px]" value={f.residenceType} onChange={(e) => setF({ ...f, residenceType: e.target.value })}>
                <option value="domestic">국내</option>
                <option value="overseas">해외</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] text-fg-muted">상태</span>
              <select className="input h-7 w-full text-[12px]" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                {Object.entries(STATUS_LABEL).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] text-fg-muted">학년</span>
              <input className="input h-7 w-full text-[12px]" type="number" min={1} max={12} value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-[11px] text-fg-muted">연락처</span>
              <input className="input h-7 w-full text-[12px]" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            </label>
          </div>
          {f.status === "canceled" && (
            <p className="text-[11px] text-attention">퇴원(수강 자동 정리)은 학생·부모 탭의 "퇴원 처리"를 권장합니다 — 여기서는 상태 표기만 바뀝니다.</p>
          )}
          <div className="flex gap-1.5 justify-end">
            <button className="btn btn-sm h-6" onClick={() => setEditing(false)}>취소</button>
            <button className="btn btn-sm h-6 btn-primary" disabled={updateStudent.isPending} onClick={save}>
              {updateStudent.isPending ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
