'use client';
// [C2C-b] 승인센터 요청 상세 모달 — 리스트 행 클릭 시 "누가·언제·무엇을·어떻게"를 audit_log 스타일로 표시.
//  대표 지시(2026-07-08): 모든 승인 리스트는 상세 모달 필수 + 모달 안에서 승인/반려/수정 가능(컴포넌트 재사용).
//  데이터 무결성: 세부 정보를 복제 저장하지 않고 단일 소스 Query 조인으로 구성 —
//   · 행 자체 = useScheduleRequests **라이브 구독**(수정/처리 후 자동 최신화 — prop 스냅샷 아님)
//   · before(현재 블록) = qk.availability.all (useAllAvailability)
//   · 영향 수업 = qk.schedule (useSchedule, 권위 소스 /schedule)
//   · 처리 이력 = audit_log(entity='schedule_requests') — ChangeHistory 재사용(R-6과 동일 컴포넌트)
//  액션: 승인/반려 = 부모(ApprovalsView) 기존 핸들러 재사용(force 분기·ReasonModal 사유 필수).
//  [청크2] 수정 = PATCH /schedule-requests/:id (pending·관리자) — useUpdateScheduleRequest, 변경 필드만 전송(audit diff 최소화).
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui';
import { ChangeHistory } from '@/features/calendar/ChangeHistory';
import { useAllAvailability, useSchedule, useRooms, useStudents, useScheduleRequests, useUpdateScheduleRequest } from '@/lib/queries';
import {
  AVAILABILITY_KIND_LABEL, REQUEST_FIELD_LABEL, REQUEST_KIND_LABEL, REQUEST_STATUS_LABEL,
  WEEKDAY_LABEL, availabilityRequestDiff, fmtRequestAt,
} from '@/lib/domain/approvals';
import type { ScheduleRequestEx, UpdateScheduleRequestBody } from '@/lib/api';

const SESSION_KIND_LABEL: Record<string, string> = { class: '수업', level_test: '진단고사', counsel: '상담' };

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-body">
      <span className="w-20 shrink-0 text-fg-muted">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-caption text-fg-muted space-y-1">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function RequestDetailModal({
  request: initial, instructorName, courseName, onClose, onApprove, onReject,
}: {
  request: ScheduleRequestEx;
  instructorName: (id?: number) => string;
  courseName: (id?: number) => string;
  onClose: () => void;
  onApprove: (r: ScheduleRequestEx) => void; // 부모 onApproveRequest 재사용(409→force 분기 포함)
  onReject: (r: ScheduleRequestEx) => void;  // 부모 ReasonModal 흐름 재사용(사유 필수)
}) {
  const { data: allReqs = [] } = useScheduleRequests();
  const r = allReqs.find((x) => x.id === initial.id) ?? initial; // 라이브 행(수정·처리 후 자동 갱신)
  const { data: blocks = [] } = useAllAvailability();
  const { data: sessions = [] } = useSchedule();
  const { data: rooms = [] } = useRooms();
  const { data: students = [] } = useStudents();
  const updateRequest = useUpdateScheduleRequest();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  const isAvailability = r.requestKind === 'availability_upsert' || r.requestKind === 'availability_delete';
  const editable = r.status === 'pending' && r.requestKind !== 'availability_delete'; // 삭제 요청은 수정 항목 없음(BE 400)
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
  // 행위자 표기 — 강사 목록에 없는 매니저/대표는 '직원 #id'로(이력·처리 표시 공용)
  const actorName = (id?: number) => { const n = instructorName(id); return n === '—' && id != null ? `직원 #${id}` : n; };
  const studentNames = (ids?: number[]) =>
    ids?.length ? ids.map((id) => students.find((s) => s.id === id)?.name ?? `#${id}`).join(', ') : '코스 전원(활성 수강생)';

  // ── 수정 모드 — 현재 값으로 폼 시드 → 변경 필드만 PATCH(감사 diff 최소화) ──
  const startEdit = () => {
    setErr(null);
    setForm(
      isAvailability
        ? {
            availabilityKind: r.availabilityKind ?? 'available',
            availabilityWeekday: String(r.availabilityWeekday ?? 1),
            availabilityStartTime: r.availabilityStartTime ?? '', availabilityEndTime: r.availabilityEndTime ?? '',
            availabilityEffectiveFrom: r.availabilityEffectiveFrom ?? '', availabilityEffectiveTo: r.availabilityEffectiveTo ?? '',
          }
        : {
            sessionDate: r.sessionDate ?? '', startTime: r.startTime ?? '', endTime: r.endTime ?? '',
            roomId: r.roomId != null ? String(r.roomId) : '', topic: r.topic ?? '',
            kind: r.kind ?? 'class', mode: r.mode ?? 'in_person',
          },
    );
    setEditing(true);
  };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const saveEdit = () => {
    const body: UpdateScheduleRequestBody = {};
    if (isAvailability) {
      if (form.availabilityKind !== r.availabilityKind) body.availabilityKind = form.availabilityKind as UpdateScheduleRequestBody['availabilityKind'];
      if (Number(form.availabilityWeekday) !== r.availabilityWeekday) body.availabilityWeekday = Number(form.availabilityWeekday);
      if (form.availabilityStartTime && form.availabilityStartTime !== r.availabilityStartTime) body.availabilityStartTime = form.availabilityStartTime;
      if (form.availabilityEndTime && form.availabilityEndTime !== r.availabilityEndTime) body.availabilityEndTime = form.availabilityEndTime;
      if (form.availabilityEffectiveFrom !== (r.availabilityEffectiveFrom ?? '')) body.availabilityEffectiveFrom = form.availabilityEffectiveFrom || undefined;
      if (form.availabilityEffectiveTo !== (r.availabilityEffectiveTo ?? '')) body.availabilityEffectiveTo = form.availabilityEffectiveTo || undefined;
    } else {
      if (form.sessionDate && form.sessionDate !== r.sessionDate) body.sessionDate = form.sessionDate;
      if (form.startTime && form.startTime !== r.startTime) body.startTime = form.startTime;
      if (form.endTime && form.endTime !== (r.endTime ?? '')) body.endTime = form.endTime;
      const roomId = form.roomId === '' ? undefined : Number(form.roomId);
      if (roomId !== r.roomId && roomId != null) body.roomId = roomId;
      if (form.topic !== (r.topic ?? '')) body.topic = form.topic;
      if (form.kind !== (r.kind ?? 'class')) body.kind = form.kind as UpdateScheduleRequestBody['kind'];
      if (form.mode !== (r.mode ?? 'in_person')) body.mode = form.mode as UpdateScheduleRequestBody['mode'];
    }
    if (!Object.keys(body).length) { setEditing(false); return; }
    updateRequest.mutate({ id: r.id, body }, {
      onSuccess: () => { setEditing(false); setErr(null); },
      onError: (e) => {
        const ex = e as { response?: { data?: { message?: string | string[] } } };
        const m = ex.response?.data?.message;
        setErr(Array.isArray(m) ? m.join(' · ') : m ?? '수정 실패 — 입력을 확인하세요');
      },
    });
  };

  return (
    <div className="fixed inset-0 z-[55] grid place-items-center p-4 bg-black/35" onClick={onClose}>
      <div className="card card-pad w-[560px] max-w-[95vw] max-h-[85vh] flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 shrink-0">
          <div className="font-semibold">{kindLabel} #{r.id}</div>
          <span className={`badge text-micro ${r.status === 'pending' ? 'badge-attention' : r.status === 'approved' ? 'badge-success' : 'badge-danger'}`}>{statusLabel}</span>
          {editable && !editing && <button className="btn btn-sm" onClick={startEdit}>수정</button>}
          <button className="btn btn-sm ml-auto" onClick={onClose}>닫기</button>
        </div>

        <div className="space-y-3 min-h-0 overflow-y-auto pr-1">
          {/* 누가·언제 */}
          <section className="rounded-md border p-3 space-y-1">
            <MetaRow label="요청자">{instructorName(r.requesterId)}</MetaRow>
            <MetaRow label="요청 시각"><span className="mono">{fmtRequestAt(r.createdAt)}</span></MetaRow>
            {r.decidedBy != null && (
              <MetaRow label="처리">
                {actorName(r.decidedBy)} · <span className="mono">{fmtRequestAt(r.decidedAt)}</span>
              </MetaRow>
            )}
            {r.reason && <MetaRow label="반려 사유">{r.reason}</MetaRow>}
            {r.changeSummary && <MetaRow label="요약">{r.changeSummary}</MetaRow>}
          </section>

          {/* 무엇을·어떻게 — availability는 before→after diff, 수업 생성은 요청 필드 전체. 수정 모드=편집 폼 */}
          <section className="rounded-md border overflow-hidden">
            <div className="px-3 py-2 text-caption font-medium bg-canvas-subtle">
              {editing ? (
                <>요청 내용 수정 — 저장 시 감사 이력(diff)에 기록됩니다</>
              ) : isAvailability ? (
                <>요청 내용 — {AVAILABILITY_KIND_LABEL[targetBlock?.kind ?? r.availabilityKind ?? 'available']}{r.targetAvailabilityId != null ? ` (대상 블록 #${r.targetAvailabilityId})` : ' (신규)'}</>
              ) : (
                <>요청 내용 — {r.requestKind === 'session_update' ? `수업 변경${r.targetSessionId != null ? ` (대상 세션 #${r.targetSessionId})` : ''}` : '새 수업'}</>
              )}
            </div>
            {editing ? (
              <div className="p-3 space-y-2">
                {isAvailability ? (
                  <div className="grid grid-cols-2 gap-2">
                    <EditField label="종류">
                      <select className="input" value={form.availabilityKind} onChange={set('availabilityKind')}>
                        <option value="available">가용시간</option>
                        <option value="unavailable">불가시간</option>
                        <option value="online_only">온라인만 가능</option>
                      </select>
                    </EditField>
                    <EditField label="요일">
                      <select className="input" value={form.availabilityWeekday} onChange={set('availabilityWeekday')}>
                        {WEEKDAY_LABEL.map((w, i) => <option key={i} value={i}>{w}</option>)}
                      </select>
                    </EditField>
                    <EditField label="시작"><input type="time" className="input" value={form.availabilityStartTime} onChange={set('availabilityStartTime')} /></EditField>
                    <EditField label="종료"><input type="time" className="input" value={form.availabilityEndTime} onChange={set('availabilityEndTime')} /></EditField>
                    <EditField label="적용 시작(선택)"><input type="date" className="input" value={form.availabilityEffectiveFrom} onChange={set('availabilityEffectiveFrom')} /></EditField>
                    <EditField label="적용 종료(선택)"><input type="date" className="input" value={form.availabilityEffectiveTo} onChange={set('availabilityEffectiveTo')} /></EditField>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <EditField label="날짜"><input type="date" className="input" value={form.sessionDate} onChange={set('sessionDate')} /></EditField>
                    <EditField label="강의실">
                      <select className="input" value={form.roomId} onChange={set('roomId')}>
                        <option value="">미지정</option>
                        {rooms.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </EditField>
                    <EditField label="시작"><input type="time" className="input" value={form.startTime} onChange={set('startTime')} /></EditField>
                    <EditField label="종료"><input type="time" className="input" value={form.endTime} onChange={set('endTime')} /></EditField>
                    <EditField label="종류">
                      <select className="input" value={form.kind} onChange={set('kind')}>
                        <option value="class">수업</option>
                        <option value="level_test">진단고사</option>
                        <option value="counsel">상담</option>
                      </select>
                    </EditField>
                    <EditField label="수업방식">
                      <select className="input" value={form.mode} onChange={set('mode')}>
                        <option value="in_person">대면</option>
                        <option value="online">비대면</option>
                      </select>
                    </EditField>
                    <div className="col-span-2">
                      <EditField label="주제"><input type="text" className="input w-full" value={form.topic} onChange={set('topic')} maxLength={200} /></EditField>
                    </div>
                  </div>
                )}
                {err && <div className="text-caption text-danger">{err}</div>}
                <div className="flex justify-end gap-2">
                  <button className="btn btn-sm" onClick={() => { setEditing(false); setErr(null); }}>취소</button>
                  <button className="btn btn-sm btn-primary" disabled={updateRequest.isPending} onClick={saveEdit}>{updateRequest.isPending ? '저장 중…' : '저장'}</button>
                </div>
              </div>
            ) : isAvailability ? (
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
                <MetaRow label="수업방식">{(r.mode ?? 'in_person') === 'online' ? '비대면' : '대면'}</MetaRow>
                <div className="col-span-2"><MetaRow label="학생">{studentNames(r.studentIds)}</MetaRow></div>
                {r.topic && <div className="col-span-2"><MetaRow label="주제">{r.topic}</MetaRow></div>}
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

          {/* 처리 이력 — audit_log 그대로(생성→수정→승인/반려), R-6 ChangeHistory 재사용 */}
          <section className="rounded-md border p-3">
            <div className="text-caption font-medium mb-1.5">처리 이력</div>
            <ChangeHistory entity="schedule_requests" entityId={r.id} actorName={(id) => actorName(id)} fieldLabels={REQUEST_FIELD_LABEL} />
          </section>
        </div>

        {r.status === 'pending' && !editing && (
          <div className="flex justify-end gap-2 pt-1 shrink-0 border-t">
            <button className="btn btn-sm btn-danger mt-2" onClick={() => onReject(r)}>반려</button>
            <button className="btn btn-sm btn-primary mt-2" onClick={() => onApprove(r)}>승인</button>
          </div>
        )}
      </div>
    </div>
  );
}
