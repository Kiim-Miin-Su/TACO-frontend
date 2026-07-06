"use client";
// 목록 데이터(students·enrollments·courses·parentStudents·parents)는 TanStack Query로 읽고,
// 퇴원(소프트삭제)은 useRemoveStudent 훅(백엔드 DELETE /students/:id)으로 처리한다.
import { Badge, SectionCard, StatusDot, type Tone } from "@/components/ui";
import { useStudents, useEnrollments, useCourses, useParentStudents, useParents, useRemoveStudent } from "@/lib/queries";
import { isActiveStudent, activeCourseNamesOf, STUDENT_STATUS_LABEL as label, STUDENT_STATUS_TONE } from "@/lib/domain/students";
import { CountryBadge } from "@/features/calendar/CountryInput";
import type { StudentStatus } from "@/types";
import { StudentForm } from "./StudentForm";
import { useState } from "react";


export function StudentsView() {
  const { data: students = [] } = useStudents();
  const { data: enrollments = [] } = useEnrollments();
  const { data: courses = [] } = useCourses();
  const { data: parentStudents = [] } = useParentStudents();
  const { data: parents = [] } = useParents();
  const removeStudent = useRemoveStudent();
  const [q, setQ] = useState("");
  const [showDropped, setShowDropped] = useState(false);
  const kw = q.trim().toLowerCase();

  // 기본 스코프 = 활성 학생만(퇴원 제외). 토글 시 퇴원 포함.
  const scoped = showDropped ? students : students.filter(isActiveStudent);
  const filtered = kw
    ? scoped.filter((s) =>
        [s.name, s.englishName, s.webId, s.phone]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(kw)),
      )
    : scoped;
  const activeCount = students.filter(isActiveStudent).length;

  // 통일 감사 2026-07-03: 캘린더 유저 카드와 동일 함수(활성 수강 기준 — 취소된 수강 노출 제거 효과)
  const coursesOf = (studentId: number) => activeCourseNamesOf(studentId, enrollments, courses);

  const parentOf = (studentId: number) => {
    const link = parentStudents.find((ps) => ps.studentId === studentId);
    if (!link) return undefined;
    const p = parents.find((x) => x.id === link.parentId);
    return p ? `${p.name} (${link.relation ?? "보호자"})` : undefined;
  };

  return (
    <div className="p-6 max-w-[1180px] mx-auto space-y-6">
      <div>
        <h1 className="text-title font-bold">학생</h1>
        <p className="text-body text-fg-muted mt-0.5">학생 등록 및 목록 · 활성 {activeCount}명</p>
      </div>

      <SectionCard title="학생 등록">
        <StudentForm />
      </SectionCard>

      <SectionCard
        title="학생 목록"
        action={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-caption text-fg-muted select-none">
              <input type="checkbox" checked={showDropped} onChange={(e) => setShowDropped(e.target.checked)} />
              퇴원 포함
            </label>
            <input className="input w-56 h-7" placeholder="이름·영문·ID·연락처 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>이름</th>
                <th>학년</th>
                <th>국가</th>
                <th>Web ID</th>
                <th>등록 코스</th>
                <th>학부모</th>
                <th>상태</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const cs = coursesOf(s.id);
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-caption text-fg-subtle">{s.englishName ?? ""}</div>
                    </td>
                    <td className="mono">{s.grade ?? "—"}</td>
                    {/* 국가(피드백 2026-07-02): 해외 학생 시차 시간표의 기준 — 미지정은 KR(국내) 간주 */}
                    <td><CountryBadge code={s.country} /></td>
                    <td className="mono text-fg-muted">{s.webId ?? <span className="text-fg-subtle">미가입</span>}</td>
                    <td className="text-fg-muted">{cs.length ? cs.join(", ") : "—"}</td>
                    <td className="text-fg-muted">{parentOf(s.id) ?? "—"}</td>
                    <td>
                      <Badge tone={(STUDENT_STATUS_TONE[s.status] as Tone)}>
                        <StatusDot tone={(STUDENT_STATUS_TONE[s.status] as Tone)} label={label[s.status]} />
                      </Badge>
                    </td>
                    <td className="text-right">
                      {isActiveStudent(s) ? (
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => {
                            if (
                              confirm(
                                `${s.name} 학생을 퇴원 처리할까요?\n상담·수업보고서·결제 등 이력은 보존되며, 활성 목록과 일정에서만 제외됩니다.`,
                              )
                            ) {
                              removeStudent.mutate(s.id);
                            }
                          }}
                        >
                          퇴원 처리
                        </button>
                      ) : (
                        <span className="text-caption text-fg-subtle">퇴원됨</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
