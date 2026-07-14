"use client";
import Link from "next/link";
// 목록 데이터(students·enrollments·courses·parentStudents·parents)는 TanStack Query로 읽고,
// 퇴원(소프트삭제)은 useRemoveStudent 훅(백엔드 DELETE /students/:id)으로 처리한다.
// [DESIGN §8·§5.5] 첫 화면 = 목록(조회 우선). 등록 폼은 접이식 패널(기본 접힘) — 헤더 버튼 토글.
import { Badge, ConfirmModal, EmptyState, PageHeader, SectionCard, StatusDot, TableWrap, type Tone } from "@/components/ui";
import { useStudents, useEnrollments, useCourses, useParentStudents, useParents, useRemoveStudent } from "@/lib/queries";
import { isActiveStudent, activeCourseNamesOf, STUDENT_STATUS_LABEL as label, STUDENT_STATUS_TONE } from "@/lib/domain/students";
import { CountryBadge } from "@/features/calendar/CountryInput";
import { useAccountAccess } from "@/lib/useAccountAccess";
import type { Student } from "@/types";
import { StudentForm } from "./StudentForm";
import { useState } from "react";


export function StudentsView() {
  // [TBO-20 M1] 학생 등록·퇴원 = 관리자 전용(BE students POST/DELETE=ADMIN 정합). 강사엔 쓰기 버튼 숨김(403 방지).
  const admin = useAccountAccess().can("admin.area");
  const { data: students = [] } = useStudents();
  const { data: enrollments = [] } = useEnrollments();
  const { data: courses = [] } = useCourses();
  const { data: parentStudents = [] } = useParentStudents();
  const { data: parents = [] } = useParents();
  const removeStudent = useRemoveStudent();
  const [q, setQ] = useState("");
  const [showDropped, setShowDropped] = useState(false);
  const [showForm, setShowForm] = useState(false); // 등록 패널 — 기본 접힘
  const [dropTarget, setDropTarget] = useState<Student | null>(null); // 퇴원 확인 모달
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
    <div className="p-6 max-w-page mx-auto space-y-6">
      <PageHeader
        title="학생 · 부모"
        sub={`활성 ${activeCount}명`}
        actions={
          admin && (
            <button className={showForm ? "btn" : "btn btn-primary"} onClick={() => setShowForm((v) => !v)}>
              {showForm ? "등록 닫기" : "+ 학생 등록"}
            </button>
          )
        }
      />

      {/* 등록 폼 — 접이식(기본 접힘). 목록이 항상 첫 화면. */}
      {showForm && admin && (
        <SectionCard title="학생 등록" action={<button className="btn btn-sm" onClick={() => setShowForm(false)}>닫기</button>}>
          <StudentForm />
        </SectionCard>
      )}

      <SectionCard
        title={`학생 목록 (${filtered.length})`}
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
        {filtered.length === 0 ? (
          <EmptyState
            message={kw ? "검색 결과가 없습니다." : "등록된 학생이 없습니다."}
            action={!kw && admin && <button className="btn btn-sm" onClick={() => setShowForm(true)}>+ 학생 등록</button>}
          />
        ) : (
        <TableWrap minWidth={880}>
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
                      {/* [TBO-20 20-A] 이름 클릭 → 학생 상세(프로필 허브) */}
                      <Link href={`/students/${s.id}`} className="font-medium text-accent hover:underline">{s.name}</Link>
                      <div className="text-caption text-fg-subtle">{s.englishName ?? ""}</div>
                    </td>
                    <td className="mono">{s.grade ?? "—"}</td>
                    {/* 국가(피드백 2026-07-02): 해외 학생 시차 시간표의 기준 — 미지정은 KR(국내) 간주 */}
                    <td><CountryBadge code={s.country} /></td>
                    <td className="mono text-fg-muted">{s.webId ?? <span className="text-fg-subtle">미가입</span>}</td>
                    <td className="text-fg-muted max-w-[220px] truncate" title={cs.join(", ")}>{cs.length ? cs.join(", ") : "—"}</td>
                    <td className="text-fg-muted">{parentOf(s.id) ?? "—"}</td>
                    <td>
                      <Badge tone={(STUDENT_STATUS_TONE[s.status] as Tone)}>
                        <StatusDot tone={(STUDENT_STATUS_TONE[s.status] as Tone)} label={label[s.status]} />
                      </Badge>
                    </td>
                    <td className="text-right">
                      {!isActiveStudent(s) ? (
                        <span className="text-caption text-fg-subtle">퇴원됨</span>
                      ) : admin ? (
                        // [DESIGN §5.5] 파괴적 액션 확인은 ConfirmModal(danger) · 관리자 전용(BE DELETE=ADMIN)
                        <button className="btn btn-sm btn-danger" onClick={() => setDropTarget(s)}>
                          퇴원 처리
                        </button>
                      ) : (
                        <span className="text-caption text-fg-subtle">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
        )}
      </SectionCard>

      {dropTarget && (
        <ConfirmModal
          title={`${dropTarget.name} 학생 퇴원 처리`}
          message="상담·수업보고서·결제 등 이력은 보존되며, 활성 목록과 일정에서만 제외됩니다."
          confirmLabel="퇴원 처리"
          danger
          onClose={() => setDropTarget(null)}
          onConfirm={() => { removeStudent.mutate(dropTarget.id); setDropTarget(null); }}
        />
      )}
    </div>
  );
}
