"use client";
import Link from "next/link";
// 목록 데이터(students·enrollments·courses·parentStudents·parents)는 TanStack Query로 읽고,
// 원부 삭제는 상세의 위험 작업 영역에서만 제공하며, 목록은 조회와 업무 상태 변경에 집중한다.
// [DESIGN §8·§5.5] 첫 화면 = 목록(조회 우선). 등록 폼은 접이식 패널(기본 접힘) — 헤더 버튼 토글.
// [B6 C3 2026-07-16] 행 전체 클릭 = 학생 상세(ClickableTableRow href) — 퇴원 버튼은 중첩 제외로 안전.
import { Badge, ClickableTableRow, EmptyState, LoadingState, PageHeader, SectionCard, StatusDot, TableWrap, type Tone } from "@/components/ui";
import { useStudents, useEnrollments, useCourses, useParentStudents, useParents } from "@/lib/queries";
import { activeCourseNamesOf, studentGradeLabel, STUDENT_STATUS_LABEL as label, STUDENT_STATUS_TONE } from "@/lib/domain/students";
import { CountryBadge } from "@/features/calendar/CountryInput";
import { useAccountAccess } from "@/lib/useAccountAccess";
import type { Student } from "@/types";
import { StudentForm } from "./StudentForm";
import { StudentStatusChangeModal } from "./StudentStatusChangeModal";
import { useState } from "react";
import { internalRoute } from "@/lib/navigation-security";


export function StudentsView() {
  // [TBO-20 M1] 학생 등록·상태 변경·원부 삭제 = 관리자 전용(BE ADMIN 정합). 강사엔 쓰기 버튼 숨김(403 방지).
  const admin = useAccountAccess().can("admin.area");
  const [q, setQ] = useState("");
  const [showDropped, setShowDropped] = useState(false);
  const [showForm, setShowForm] = useState(false); // 등록 패널 — 기본 접힘
  const [statusTarget, setStatusTarget] = useState<Student | null>(null);
  // 서버 기본 스코프는 활성 원부다. 사용자가 이력 포함을 명시한 경우에만 inactive를 요청한다.
  const { data: students = [], isPending: loading } = useStudents(showDropped); // [E0.6 H2]
  const { data: enrollments = [] } = useEnrollments();
  const { data: courses = [] } = useCourses();
  const { data: parentStudents = [] } = useParentStudents();
  const { data: parents = [] } = useParents();
  const kw = q.trim().toLowerCase();

  const filtered = kw
    ? students.filter((s) =>
        [s.name, s.englishName, s.webId, s.phone]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(kw)),
      )
    : students;

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
        sub={`${showDropped ? "전체 이력" : "활성"} ${students.length}명`}
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
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <label className={`flex min-h-8 cursor-pointer items-center gap-2 rounded-md border px-3 text-caption select-none ${showDropped ? 'border-accent bg-accent-subtle text-fg' : 'border-line-muted text-fg-muted'}`}>
              <input className="h-4 w-4" type="checkbox" checked={showDropped} onChange={(e) => setShowDropped(e.target.checked)} />
              퇴원·등록이탈 이력 포함
            </label>
            <input className="input w-56 h-7" placeholder="이름·영문·ID·연락처 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      >
        {loading ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
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
                  <ClickableTableRow key={s.id} href={internalRoute.student(s.id)} label={`${s.name} 학생 상세`}>
                    <td>
                      {/* [TBO-20 20-A] 이름 클릭 → 학생 상세(프로필 허브) */}
                      <Link href={internalRoute.student(s.id)} className="font-medium text-accent hover:underline">{s.name}</Link>
                      <div className="text-caption text-fg-subtle">{s.englishName ?? ""}</div>
                    </td>
                    <td className="mono">{studentGradeLabel(s.grade)}</td>
                    {/* 국가(피드백 2026-07-02): 해외 학생 시차 시간표의 기준 — 미지정은 KR(국내) 간주 */}
                    <td><CountryBadge code={s.country} /></td>
                    <td className="text-fg-muted max-w-[220px] truncate" title={cs.join(", ")}>{cs.length ? cs.join(", ") : "—"}</td>
                    <td className="text-fg-muted">{parentOf(s.id) ?? "—"}</td>
                    <td>
                      <Badge tone={(STUDENT_STATUS_TONE[s.status] as Tone)}>
                        <StatusDot tone={(STUDENT_STATUS_TONE[s.status] as Tone)} label={label[s.status]} />
                      </Badge>
                    </td>
                    <td className="text-right">
                      {admin ? (
                        <span className="inline-flex items-center gap-1.5">
                          <button type="button" className="btn btn-sm" onClick={() => setStatusTarget(s)}>
                            상태 변경
                          </button>
                        </span>
                      ) : (
                        <span className="text-caption text-fg-subtle">—</span>
                      )}
                    </td>
                  </ClickableTableRow>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
        )}
      </SectionCard>

      {statusTarget && <StudentStatusChangeModal student={statusTarget} onClose={() => setStatusTarget(null)} />}
    </div>
  );
}
