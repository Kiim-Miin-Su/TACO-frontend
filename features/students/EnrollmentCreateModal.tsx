"use client";

import { useMemo, useState } from "react";
import type { ConvertCounselInput, Course, CreateEnrollmentInput, Enrollment } from "@kms545487/contracts";
import type { RoadmapAggregate } from "@/lib/api";
import { ModalShell } from "@/components/ui";
import { useConvertCounsel, useCreateEnrollment } from "@/lib/queries";
import { eligibleRoadmapsForCourse } from "@/lib/domain/enrollments";
import { todayKst } from "@/lib/format";
import { apiErrorMessage } from "@/lib/api-error";

export function EnrollmentCreateModal({
  studentId,
  courses,
  enrollments,
  roadmaps,
  convertCounselFormId,
  onClose,
}: {
  studentId: number;
  courses: Course[];
  enrollments: Enrollment[];
  roadmaps: RoadmapAggregate[];
  /** [TBO-80 80E] 지정 시 상담→수강 전환 command(POST /counsel/:id/convert)로 제출 —
   *  같은 폼·검증을 재사용하고 서버가 studentId·counselCardId·폼 전이를 한 tx로 결정한다. */
  convertCounselFormId?: number;
  onClose: () => void;
}) {
  const create = useCreateEnrollment();
  const convert = useConvertCounsel();
  const pending = convertCounselFormId != null ? convert.isPending : create.isPending;
  const linkedCourseIds = useMemo(
    () => new Set(enrollments.map((enrollment) => enrollment.courseId)),
    [enrollments],
  );
  const availableCourses = useMemo(
    () => courses.filter((course) => !linkedCourseIds.has(course.id)),
    [courses, linkedCourseIds],
  );
  const [courseId, setCourseId] = useState<number | null>(availableCourses[0]?.id ?? null);
  const [roadmapId, setRoadmapId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(todayKst());
  const [endDate, setEndDate] = useState("");
  const [totalSessions, setTotalSessions] = useState("");
  const [memo, setMemo] = useState("");
  const [message, setMessage] = useState("");
  const eligibleRoadmaps = eligibleRoadmapsForCourse(roadmaps, courseId);
  const invalid =
    courseId == null
    || (startDate !== "" && endDate !== "" && endDate < startDate)
    || (totalSessions !== "" && (!Number.isInteger(Number(totalSessions)) || Number(totalSessions) < 0));

  const save = () => {
    if (invalid || courseId == null) return;
    setMessage("");
    const common = {
      courseId,
      ...(roadmapId == null ? {} : { roadmapId }),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      ...(totalSessions === "" ? {} : { totalSessions: Number(totalSessions) }),
      ...(memo.trim() ? { memo: memo.trim() } : {}),
    };
    if (convertCounselFormId != null) {
      const input: ConvertCounselInput = common;
      convert.mutate({ id: convertCounselFormId, input }, {
        onSuccess: onClose,
        onError: (error) => setMessage(apiErrorMessage(error, "상담을 수강으로 전환하지 못했습니다.")),
      });
      return;
    }
    const input: CreateEnrollmentInput = { studentId, ...common };
    create.mutate(input, {
      onSuccess: onClose,
      onError: (error) => setMessage(apiErrorMessage(error, "수강을 등록하지 못했습니다.")),
    });
  };

  return (
    <ModalShell
      title={convertCounselFormId != null ? "상담 → 수강 전환" : "수강 코스 등록"}
      size="md"
      onClose={onClose}
      bodyClassName="space-y-4"
      footer={(
        <>
          <button className="btn btn-sm" disabled={pending} onClick={onClose}>취소</button>
          <button className="btn btn-sm btn-primary" disabled={pending || invalid} onClick={save}>
            {pending ? "DB 확인 중…" : convertCounselFormId != null ? "전환 등록" : "수강 등록"}
          </button>
        </>
      )}
    >
      <p className="text-caption text-fg-muted">
        {convertCounselFormId != null
          ? "상담카드가 이 수강에 FK로 연결되고 상담 상태가 등록으로 전이됩니다(한 트랜잭션 — 실패 시 전부 취소)."
          : "이미 연결된 코스는 상태 변경으로 다시 활성화합니다. 새 연결은 학생·코스·로드맵을 한 트랜잭션에서 검증합니다."}
      </p>
      <label className="block">
        <span className="block text-caption font-medium text-fg-muted mb-1">코스 *</span>
        <select
          className="input w-full"
          data-modal-autofocus="true"
          value={courseId ?? ""}
          onChange={(event) => {
            setCourseId(event.target.value ? Number(event.target.value) : null);
            setRoadmapId(null);
          }}
        >
          {!availableCourses.length && <option value="">등록 가능한 코스 없음</option>}
          {availableCourses.map((course) => (
            <option key={course.id} value={course.id}>{course.name}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="block text-caption font-medium text-fg-muted mb-1">수강 로드맵</span>
        <select
          className="input w-full"
          value={roadmapId ?? ""}
          onChange={(event) => setRoadmapId(event.target.value ? Number(event.target.value) : null)}
        >
          <option value="">로드맵 없이 등록</option>
          {eligibleRoadmaps.map((roadmap) => (
            <option key={roadmap.id} value={roadmap.id}>{roadmap.title}</option>
          ))}
        </select>
        {courseId != null && !eligibleRoadmaps.length && (
          <span className="block text-micro text-fg-subtle mt-1">이 코스를 포함한 활성 로드맵이 없습니다.</span>
        )}
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-caption font-medium text-fg-muted mb-1">시작일</span>
          <input className="input w-full" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label className="block">
          <span className="block text-caption font-medium text-fg-muted mb-1">종료일</span>
          <input className="input w-full" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className="block text-caption font-medium text-fg-muted mb-1">총 회차</span>
        <input
          className="input w-full"
          type="number"
          min={0}
          max={1000}
          value={totalSessions}
          onChange={(event) => setTotalSessions(event.target.value)}
        />
      </label>
      <label className="block">
        <span className="block text-caption font-medium text-fg-muted mb-1">수강 메모</span>
        <textarea
          className="input w-full min-h-20 resize-y"
          maxLength={500}
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
        />
      </label>
      {startDate && endDate && endDate < startDate && (
        <p className="text-caption text-danger">종료일은 시작일보다 빠를 수 없습니다.</p>
      )}
      {message && <p className="text-caption text-danger" role="alert">{message}</p>}
    </ModalShell>
  );
}
