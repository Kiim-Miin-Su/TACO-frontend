// [참조/처리] 수업 피드백(보고서) 작성 전용 페이지 — 학부모 발송대상 확인 + 공용 SessionFeedbackForm.
//  [TBO-20 20-0] 작성 폼은 `<SessionFeedbackForm>`(reports)로 단일화 — ReportWriteView·세션 허브와 동일 컴포넌트.
//  이 페이지의 고유 역할 = 학부모 join(발송 대상) 표시. 보고서는 (sessionId,studentId) 최대 1건.
"use client";
import Link from "next/link";
import { Badge, SectionCard, type Tone } from "@/components/ui";
import { useSchedule, useStudents, useReports, useParentStudents, useParents, useCourses } from "@/lib/queries";
import { SessionFeedbackForm } from "@/features/reports/SessionFeedbackForm";
import type { ReportStatus } from "@/types";

const reportTone: Record<ReportStatus, Tone> = { draft: "neutral", submitted: "accent", sent: "success" };
const reportLabel: Record<ReportStatus, string> = { draft: "작성중", submitted: "작성완료", sent: "발송됨" };

export function FeedbackFormView({ sessionId, studentId }: { sessionId: number; studentId: number }) {
  const { data: classSessions = [] } = useSchedule();
  const { data: students = [] } = useStudents();
  const { data: sessionReports = [] } = useReports();
  const { data: parentStudents = [] } = useParentStudents();
  const { data: parents = [] } = useParents();
  const { data: courses = [] } = useCourses();
  const session = classSessions.find((s) => s.id === sessionId);
  const student = students.find((s) => s.id === studentId);
  const report = sessionReports.find((r) => r.sessionId === sessionId && r.studentId === studentId);

  // 학부모 join (학생 → parent_student_relations → parents) — 추후 MQ 카카오 발송 대상
  const link =
    parentStudents.find((ps) => ps.studentId === studentId && ps.isPrimary) ??
    parentStudents.find((ps) => ps.studentId === studentId);
  const parent = link ? parents.find((p) => p.id === link.parentId) : undefined;

  if (!session || !student) {
    return <div className="p-6 max-w-[760px] mx-auto text-fg-muted">대상을 찾을 수 없습니다.</div>;
  }

  const course = courses.find((c) => c.id === session.courseId);

  return (
    <div className="p-6 max-w-[760px] mx-auto space-y-5">
      <div>
        <Link href={`/sessions/${sessionId}`} className="text-caption text-fg-muted hover:underline">
          ← 수업 상세
        </Link>
        <div className="flex items-center gap-2 mt-1">
          <h1 className="text-title font-bold">{student.name} 피드백</h1>
          {report && <Badge tone={reportTone[report.status]}>{reportLabel[report.status]}</Badge>}
        </div>
        <p className="text-body text-fg-muted mt-0.5">
          {course?.name} · {session.sessionDate} · {session.topic ?? "주제 미정"}
        </p>
      </div>

      {/* 발송 대상(학부모) — join 확인 */}
      <SectionCard title="발송 대상 (학부모)">
        <div className="p-4 text-body">
          {parent ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                <b>{parent.name}</b> ({link?.relation ?? "보호자"})
              </span>
              <span className="text-fg-muted mono">{parent.phone}</span>
              <Badge tone={parent.kakaoAvailable ? "success" : "neutral"}>
                카카오 {parent.kakaoAvailable ? "발송 가능" : "불가"}
              </Badge>
            </div>
          ) : (
            <span className="text-fg-subtle">연결된 학부모가 없습니다. (등록 시 학부모 정보를 추가하세요)</span>
          )}
        </div>
      </SectionCard>

      {/* 피드백 작성 — 공용 컴포넌트(템플릿·상태·저장/제출 포함) */}
      <SectionCard title="피드백 작성">
        <SessionFeedbackForm session={session} student={student} />
      </SectionCard>
    </div>
  );
}
