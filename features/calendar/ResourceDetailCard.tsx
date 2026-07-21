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
import { STUDENT_STATUS_LABEL as STATUS_LABEL, activeCourseNamesOf } from "@/lib/domain/students"; // 라벨·수강 코스 단일 소스


export function ResourceDetailCard({
  selected, onMsg, onSaved, isFiltered, onFocusView, onClearFocus, onAddSchedule,
}: {
  selected: ScheduleResource;
  onMsg: (m: string) => void;
  onSaved?: () => void; // 캘린더 rows는 Query 훅이 아닌 자체 load()라 invalidate가 닿지 않음 — 부모 재조회 연결
  isFiltered?: boolean; // 현재 캘린더가 이 유저 개인 필터 중인지
  onFocusView?: () => void; // [A안 조정] 개인 필터는 이 명시 버튼으로만(유저 선택은 뷰 불변)
  onClearFocus?: () => void;
  onAddSchedule?: () => void; // [피드백 2026-07-03] 스케줄 표를 보면서 이 유저의 수업·가용·불가 바로 추가
}) {
  // "이 유저 스케줄 추가" — 기존 유저별 추가 모달(owner·강사 프리필) 재사용(스플릿 ＋와 동일 경로)
  const addBtn = onAddSchedule && (
    <button className="btn btn-sm h-6 btn-primary" onClick={onAddSchedule} title={`${selected.name}에게 수업·가용·불가 추가(프리필)`}>
      ＋ 스케줄
    </button>
  );
  // 개인 필터 토글 버튼(공용) — 유저 정보 보기와 뷰 필터링을 분리(피드백 2026-07-03: 선택 시 뷰가 바뀌면 안 됨)
  const focusBtn = isFiltered ? (
    <button className="btn btn-sm h-6" onClick={onClearFocus} title="개인 필터 해제 — 전체 스케줄로">
      전체 보기
    </button>
  ) : (
    <button className="btn btn-sm h-6" onClick={onFocusView} title="캘린더를 이 유저의 스케줄만으로 필터링">
      🔍 이 유저만
    </button>
  );
  const { data: students = [] } = useStudents();
  const { data: enrollments = [] } = useEnrollments();
  const { data: courses = [] } = useCourses();
  const updateStudent = useUpdateStudent();

  const student: Student | undefined =
    selected.type === "student" ? students.find((s) => Number(s.id) === Number(selected.id)) : undefined;

  // 편집 폼(학생) — 선택 변경 시 서버 값으로 리셋
  const [f, setF] = useState({ country: "KR", residenceType: "domestic", status: "new_inquiry", grade: "", phone: "" });
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
      <div className="card card-pad text-body space-y-1">
        <div className="font-semibold text-body">{selected.name}</div>
        {/* [QA 2026-07-03] 좁은 패널에서 버튼이 카드 밖으로 나가던 오버플로 — flex-wrap으로 줄바꿈 허용 */}
        <div className="flex items-center justify-between gap-x-2 gap-y-1 flex-wrap">
          <span className="text-fg-muted">{selected.type === "instructor" ? `강사${selected.sub ? ` · ${selected.sub}` : ""}` : "강의실"}</span>
          <span className="inline-flex gap-1 flex-wrap justify-end">{addBtn}{focusBtn}</span>
        </div>
        {isFiltered && <p className="text-caption text-fg-subtle">캘린더가 이 {selected.type === "instructor" ? "강사" : "강의실"} 스케줄로 필터링 중입니다.</p>}
      </div>
    );
  }
  if (!student) return null;

  const myCourses = activeCourseNamesOf(Number(student.id), enrollments, courses);

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
        onSuccess: () => { setEditing(false); onMsg(`${student.name} 정보를 수정했습니다`); onSaved?.(); },
        onError: () => onMsg("학생 정보 수정 실패"),
      },
    );
  };

  return (
    <div className="card card-pad text-body space-y-2">
      {/* [QA 2026-07-03] 버튼 3개가 좁은 패널에서 카드 밖으로 나가고 이름이 세로로 꺾이던 오버플로 —
          이름은 nowrap+truncate, 버튼 그룹은 flex-wrap으로 자연 줄바꿈(넓으면 한 줄, 좁으면 다음 줄) */}
      <div className="flex items-center justify-between gap-x-2 gap-y-1 flex-wrap">
        <div className="min-w-0 whitespace-nowrap truncate">
          <span className="font-semibold text-body">{student.name}</span>
          {student.englishName && <span className="ml-1 text-fg-subtle text-micro">{student.englishName}</span>}
        </div>
        {!editing && (
          <span className="inline-flex gap-1 flex-wrap justify-end">
            {addBtn}
            {focusBtn}
            <button className="btn btn-sm h-6 whitespace-nowrap" onClick={() => setEditing(true)} title="국가(출국/입국)·상태(휴원 등)·학년·연락처 수정">
              정보 수정
            </button>
          </span>
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
            <span className="text-micro text-fg-muted">국가 (출국/입국 시 변경 — 캘린더 시차에 즉시 반영)</span>
            <select className="input h-7 w-full text-caption" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>
              {COUNTRIES.map((c) => (<option key={c.code} value={c.code}>{c.flag} {c.name}</option>))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="block">
              <span className="text-micro text-fg-muted">거주</span>
              <select className="input h-7 w-full text-caption" value={f.residenceType} onChange={(e) => setF({ ...f, residenceType: e.target.value })}>
                <option value="domestic">국내</option>
                <option value="overseas">해외</option>
              </select>
            </label>
            <label className="block">
              <span className="text-micro text-fg-muted">상태</span>
              <select className="input h-7 w-full text-caption" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                {Object.entries(STATUS_LABEL).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
              </select>
            </label>
            <label className="block">
              <span className="text-micro text-fg-muted">학년</span>
              <input className="input h-7 w-full text-caption" type="number" min={1} max={12} value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-micro text-fg-muted">연락처</span>
              <input className="input h-7 w-full text-caption" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            </label>
          </div>
          {f.status === "canceled" && (
            <p className="text-micro text-attention">퇴원(수강 자동 정리)은 학생·부모 탭의 "퇴원 처리"를 권장합니다 — 여기서는 상태 표기만 바뀝니다.</p>
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
