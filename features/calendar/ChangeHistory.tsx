"use client";
// [R-6] 세션 변경 이력 — audit_log(entity='class_sessions') 소비. 관리자만(훅이 ADMIN 게이트).
//  누가·언제·무엇을 바꿨는지: 행위(생성/수정/삭제)·행위자·시각·필드 diff(before→after)·사유.
import { useSessionAudit } from "@/lib/queries";
import { INSTRUCTOR_ATT_LABEL, STATUS_LABEL } from "@/lib/domain/lantiv";
import { EmptyState } from "@/components/ui";

const ACTION_LABEL: Record<string, string> = { create: "생성", update: "수정", delete: "삭제", restore: "복원" };
const FIELD_LABEL: Record<string, string> = {
  instructorAttendance: "강사 출결", status: "상태", sessionDate: "날짜", startTime: "시작", endTime: "종료",
  durationMinutes: "시간(분)", roomId: "강의실", instructorId: "강사", courseId: "코스", topic: "주제", memo: "메모",
  color: "색", kind: "종류", mode: "수업방식", price: "가격", studentIds: "학생", payoutId: "정산 연결", instructorPayAmount: "페이",
};
const fmtVal = (field: string, v: unknown): string => {
  if (v == null || v === "") return "—";
  if (field === "instructorAttendance") return INSTRUCTOR_ATT_LABEL[String(v)] ?? String(v);
  if (field === "status") return STATUS_LABEL[String(v)] ?? String(v);
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "object") return "…";
  return String(v);
};
const fmtAt = (at: string) => {
  const d = new Date(at);
  return isNaN(+d) ? at : d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
};

export function ChangeHistory({ sessionId, actorName }: { sessionId: number; actorName: (id: number) => string }) {
  const { data: entries = [], isLoading } = useSessionAudit(sessionId);
  if (isLoading) return <div className="text-caption text-fg-subtle p-2">이력 불러오는 중…</div>;
  if (!entries.length) return <EmptyState compact message="변경 이력이 없습니다." />;
  return (
    <ul className="space-y-2">
      {entries.map((e) => {
        const changes = e.action === "delete" ? {} : (e.changes ?? {});
        const fields = Object.keys(changes).filter((k) => k !== "__row");
        return (
          <li key={e.id} className="text-caption border-l-2 border-line-muted pl-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="badge badge-neutral text-micro">{ACTION_LABEL[e.action] ?? e.action}</span>
              <span className="text-fg-muted">{actorName(Number(e.actorId))}</span>
              <span className="text-fg-subtle mono ml-auto">{fmtAt(e.at)}</span>
            </div>
            {e.reason && <div className="text-fg-muted mt-0.5">사유: {e.reason}</div>}
            {fields.length > 0 && (
              <div className="mt-0.5 space-y-0.5">
                {fields.map((f) => (
                  <div key={f} className="text-fg-subtle">
                    <b className="text-fg-muted">{FIELD_LABEL[f] ?? f}</b>: {fmtVal(f, changes[f].before)} → <b>{fmtVal(f, changes[f].after)}</b>
                  </div>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
