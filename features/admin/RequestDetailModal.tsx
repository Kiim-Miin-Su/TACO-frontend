'use client';
// [C2C-b] 승인센터 요청 상세 모달 — 리스트 행 클릭 시 "누가·언제·무엇을·어떻게"를 audit_log 스타일로 표시.
//  대표 지시(2026-07-08): 모든 승인 리스트는 상세 모달 필수 + 모달 안에서 승인/반려 가능(컴포넌트 재사용).
//  데이터 무결성: 세부 정보를 복제 저장하지 않고 단일 소스 Query 조인으로 구성 —
//   · before(현재 블록) = qk.availability.all (useAllAvailability)
//   · 영향 수업 = qk.schedule (useSchedule, 권위 소스 /schedule)
//   · 처리 이력 = audit_log(entity='schedule_requests') — ChangeHistory 재사용(R-6과 동일 컴포넌트)
//  액션은 부모(ApprovalsView)의 기존 핸들러를 그대로 받는다(승인=onApproveRequest·force 분기 포함,
//  반려=ReasonModal 흐름) — 리스트 버튼과 동일 훅·동일 무효화(중복 구현 금지).
import { useMemo } from 'react';
import { EmptyState } from '@/components/ui';
import { ChangeHistory } from '@/features/calendar/ChangeHistory';
import { useAllAvailability, useSchedule, useRooms, useStudents } from '@/lib/queries';
import {
  AVAILABILITY_KIND_LABEL, REQUEST_FIELD_LABEL, REQUEST_KIND_LABEL, REQUEST_STATUS_LABEL,
  availabilityRequestDiff, fmtRequestAt,
} from '@/lib/domain/approvals';
import type { ScheduleRequestEx } from '@/lib/api';

const SESSION_KIND_LABEL: Record<string, string> = { class: '수업', level_test: '진단고사', counsel: '상담' };

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-body">
      <span className="w-20 shrink-0 text-fg-muted">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export function RequestDetailModal({
  request: r, instructorName, courseName, onClose, onApprove, onReject,
}: {
  request: ScheduleRequestEx;
  instructorName: (id?: number) => string;
  courseName: (id?: number) => string;
  onClose: () => void;
  onApprove: (r: ScheduleRequestEx) => void; // 부모 onApproveRequest 재사용(409→force 분기 포함)
  onReject: (r: ScheduleRequestEx) => void;  // 부모 ReasonModal 흐름 재사용(사유 필수)
}) {
  const { data: blocks = [] } = useAllAvailability();
  const { data: sessions = [] } = useSchedule();
  const { data: rooms = [] } = useRooms();
  const { data: students = [] } = useStudents();

  const isAvailability = r.requestKind === 'availability_upsert' || r.requestKind === 'availability_delete';
  const kindLabel = REQUEST_KIND_LABEL[r.requestKind ?? 'session_create'] ?? '요청';
  const statusLabel = REQUEST_STATUS_LABEL[r.status] ?? r.status;

  // before(현재 블록) — 삭제/수정 대상. pending 기준 존재해야 정상(승인 후엔 soft delete로 조회 제외될 수 있음).
  const targetBlock = useMemo(
    () => (r.targetAvailabilityId != null ? blocks.find((b) => b.id === r.targetAvailabilityId) ?? null : null),
    [blocks, r.targetAvailabilityId],
  );
  const diffRows = useMemo(() => (isAvailability ? availabilityRequestDiff(r, targetBlock) : []), [isAvailability, r, targetBlock]);

  const impacted = useMemo(
    () => (r.impactSessionIds ?? []).map((id) => sessions.find((s) => s.id === id) ?? null).map((row, i) => ({ id: (r.impactSessionIds ?? [])[i], row })),
    [r.impactSessionIds, sessions],
  );
  const roomName = (id?: number) => (id == null ? '미지정' : rooms.find((x) => x.id === id)?.name ?? `강의실 #${id}`);
  const studentNames = (ids?: number[]) =>
    ids?.length ? ids.map((id) => students.find((s) => s.id === id)?.name ?? `#${id}`).join(', ') : '코스 전원(활성 수강생)';

  return (
    <div className="fixed inset-0 z-[55] grid place-items-center p-4 bg-black/35" onClick={onClose}>
      <div className="card card-pad w-[560px] max-w-[95vw] max-h-[85vh] flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 shrink-0">
          <div className="font-semibold">{kindLabel} #{r.id}</div>
          <span className={`badge text-micro ${r.status === 'pending' ? 'badge-attention' : r.status === 'approved' ? 'badge-success' : 'badge-danger'}`}>{statusLabel}</span>
          <button className="btn btn-sm ml-auto" onClick={onClose}>닫기</button>
        </div>

        <div className="space-y-3 min-h-0 overflow-y-auto pr-1">
          {/* 누가·언제 */}
          <section className="rounded-md border p-3 space-y-1">
            <MetaRow label="요청자">{instructorName(r.requesterId)}</MetaRow>
            <MetaRow label="요청 시각"><span className="mono">{fmtRequestAt(r.createdAt)}</span></MetaRow>
            {r.decidedBy != null && (
              <MetaRow label="처리">
                {instructorName(r.decidedBy)} · <span className="mono">{fmtRequestAt(r.decidedAt)}</span>
              </MetaRow>
            )}
            {r.reason && <MetaRow label="반려 사유">{r.reason}</MetaRow>}
            {r.changeSummary && <MetaRow label="요약">{r.changeSummary}</MetaRow>}
          </section>

          {/* 무엇을·어떻게 — availability는 before→after diff, 수업 생성은 요청 필드 전체 */}
          <section className="rounded-md border overflow-hidden">
            <div className="px-3 py-2 text-caption font-medium bg-canvas-subtle">
              {isAvailability ? (
                <>요청 내용 — {AVAILABILITY_KIND_LABEL[targetBlock?.kind ?? r.availabilityKind ?? 'available']}{r.targetAvailabilityId != null ? ` (대상 블록 #${r.targetAvailabilityId})` : ' (신규)'}</>
              ) : (
                <>요청 내용 — 새 수업</>
              )}
            </div>
            {isAvailability ? (
              targetBlock == null && r.targetAvailabilityId != null ? (
                <div className="p-3 text-caption text-fg-muted">대상 블록 #{r.targetAvailabilityId}을 찾을 수 없습니다(이미 변경·삭제되었을 수 있음).</div>
              ) : (
                <table className="table">
                  <thead><tr><th>항목</th><th>현재</th><th>요청</th></tr></thead>
                  <tbody>
                    {diffRows.map((d) => (
                      <tr key={d.label}>
                        <td className="text-fg-muted">{d.label}</td>
                        <td className="mono">{d.before}</td>
                        <td className={`mono ${d.changed ? 'font-semibold text-accent' : 'text-fg-subtle'}`}>{d.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              <div className="p-3 grid grid-cols-2 gap-x-4 gap-y-1">
                <MetaRow label="코스">{courseName(r.courseId)}</MetaRow>
                <MetaRow label="강사">{instructorName(r.instructorId)}</MetaRow>
                <MetaRow label="날짜"><span className="mono">{r.sessionDate ?? '—'}</span></MetaRow>
                <MetaRow label="시간"><span className="mono">{r.startTime ?? '—'}{r.endTime ? `~${r.endTime}` : ''}{r.durationMinutes ? ` (${r.durationMinutes}분)` : ''}</span></MetaRow>
                <MetaRow label="강의실">{roomName(r.roomId)}</MetaRow>
                <MetaRow label="종류">{SESSION_KIND_LABEL[r.kind ?? 'class'] ?? r.kind}</MetaRow>
                <div className="col-span-2"><MetaRow label="학생">{studentNames(r.studentIds)}</MetaRow></div>
                {r.topic && <div className="col-span-2"><MetaRow label="주제">{r.topic}</MetaRow></div>}
                <div className="col-span-2 text-caption text-fg-subtle">수업방식(대면/비대면)은 요청 단계에서 보존되지 않습니다 — 승인 시 대면 기본(C2D 결정 대기).</div>
              </div>
            )}
          </section>

          {/* 영향 수업 — 요청 저장 시점의 impact 스냅샷 id를 권위 소스(/schedule)로 조인 */}
          {(r.impactSessionIds?.length ?? 0) > 0 && (
            <section className="rounded-md border overflow-hidden">
              <div className="px-3 py-2 text-caption font-medium bg-canvas-subtle">영향 수업 {r.impactSessionIds!.length}건</div>
              <div className="divide-y max-h-44 overflow-y-auto">
                {impacted.map(({ id, row }) => (
                  <div key={id} className="px-3 py-1.5 text-body flex items-baseline gap-2">
                    {row ? (
                      <>
                        <span className="mono text-fg-muted shrink-0">{row.sessionDate} {row.startTime}{row.endTime ? `~${row.endTime}` : ''}</span>
                        <span className="truncate">{row.courseName} · {row.instructorName}</span>
                      </>
                    ) : (
                      <span className="text-fg-muted">수업 #{id} (조회 범위 밖·삭제됨)</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 처리 이력 — audit_log 그대로(생성→승인/반려), R-6 ChangeHistory 재사용 */}
          <section className="rounded-md border p-3">
            <div className="text-caption font-medium mb-1.5">처리 이력</div>
            <ChangeHistory entity="schedule_requests" entityId={r.id} actorName={(id) => instructorName(id)} fieldLabels={REQUEST_FIELD_LABEL} />
          </section>
        </div>

        {r.status === 'pending' && (
          <div className="flex justify-end gap-2 pt-1 shrink-0 border-t">
            <button className="btn btn-sm btn-danger mt-2" onClick={() => onReject(r)}>반려</button>
            <button className="btn btn-sm btn-primary mt-2" onClick={() => onApprove(r)}>승인</button>
          </div>
        )}
      </div>
    </div>
  );
}
