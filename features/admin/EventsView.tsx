// [참조/처리] 관리자 학원 이벤트 발행/목록 화면.
//  - 목록: useAcademyEvents()(TanStack Query 단일 소스, GET /events).
//  - 발행: useCreateEvent(중앙 훅 — 성공 시 qk.events 무효화 → 목록 자동 재패칭).
//    구간 무결성(종료일 ≥ 시작일)은 폼에서 선검증 + 서버 400 재검증. 다른 엔티티 참조(FK) 없음.
//  [B6 C2] 인라인 useMutation(api.events.create 사설 정의) 제거 — 중앙 훅만 사용(E1 불변식 2).
'use client';
import { useState } from 'react';
import { Badge, SectionCard, EmptyState, LoadingState, TableWrap, ConfirmModal, ModalShell } from '@/components/ui';
import { useAcademyEvents, useCreateEvent, useRemoveEvent, useUpdateEvent } from '@/lib/queries';
import type { AcademyEvent, EventType, EventPriority } from '@/types';
import { AdminGuard, AdminHeader } from './AdminShell';
import { Field } from '@/components/ui';
import { eventLabel, eventTone, EVENT_TYPES, priorityLabel, EVENT_PRIORITIES } from './labels';

export function EventsView() {
  const { data: events = [], isPending: loading } = useAcademyEvents(); // [E0.6 H2]
  // [TBO-29D 요구 ⑥] 매니저 이상 수정/삭제 — 제목 수정은 PromptModal, 삭제는 ConfirmModal(soft delete).
  const removeEvent = useRemoveEvent();
  // [TBO-58 P2] 전체 필드 수정 — 종전 PromptModal은 제목만 patch 가능(검증① '이벤트 부분수정' 갭).
  const [editing, setEditing] = useState<AcademyEvent | null>(null);
  const [removing, setRemoving] = useState<{ id: number; title: string } | null>(null);
  return (
    <AdminGuard>
      <div className="p-6 max-w-page mx-auto space-y-6">
        <AdminHeader />
        <SectionCard title="학원 이벤트 발행"><EventForm /></SectionCard>
        <SectionCard title={`이벤트 목록 (${events.length})`}>
          {loading ? (
            <LoadingState />
          ) : events.length === 0 ? (
            <EmptyState message="발행된 이벤트가 없습니다. 위에서 이벤트를 발행하세요." />
          ) : (
          <TableWrap>
          <table className="table">
            <thead><tr><th>제목</th><th>유형</th><th>우선순위</th><th>기간</th><th></th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="font-medium">{e.title}</td>
                  <td><Badge tone={eventTone[e.type]}>{eventLabel[e.type]}</Badge></td>
                  <td>{e.priority === 'high' ? <Badge tone="danger">★ 중요</Badge> : <span className="text-fg-muted">{priorityLabel[e.priority]}</span>}</td>
                  <td className="mono text-fg-muted">{e.startDate}{e.endDate !== e.startDate ? ` ~ ${e.endDate}` : ''}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn btn-sm mr-1.5" onClick={() => setEditing(e)}>수정</button>
                    <button className="btn btn-sm text-danger" onClick={() => setRemoving({ id: e.id, title: e.title })}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableWrap>
          )}
        </SectionCard>
        {editing && <EventEditModal event={editing} onClose={() => setEditing(null)} />}
        {removing && (
          <ConfirmModal
            title="이벤트 삭제"
            message={`"${removing.title}" 이벤트를 삭제할까요? (삭제 내역은 DB에 보존됩니다)`}
            confirmLabel="삭제"
            danger
            onClose={() => setRemoving(null)}
            onConfirm={() => { removeEvent.mutate(removing.id); setRemoving(null); }}
          />
        )}
      </div>
    </AdminGuard>
  );
}

// [TBO-58 P2] 전체 필드 수정 모달 — 발행 폼(EventForm)과 같은 필드 구성(유형·기간·우선순위·메모).
//  구간 무결성(종료≥시작)은 폼 선검증 + 서버 400 재검증(부분 patch 역전 방지 — BE update DTO 규약).
function EventEditModal({ event, onClose }: { event: AcademyEvent; onClose: () => void }) {
  const update = useUpdateEvent();
  const [title, setTitle] = useState(event.title);
  const [type, setType] = useState<EventType>(event.type);
  const [priority, setPriority] = useState<EventPriority>(event.priority);
  const [startDate, setStartDate] = useState(event.startDate);
  const [endDate, setEndDate] = useState(event.endDate);
  const [memo, setMemo] = useState(event.memo ?? '');
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!title.trim() || !startDate) return setError('제목·시작일은 필수입니다.');
    const end = endDate || startDate;
    if (end < startDate) return setError('종료일은 시작일 이후여야 합니다.');
    update.mutate({
      id: event.id,
      patch: { title: title.trim(), type, priority, startDate, endDate: end, memo: memo.trim() || undefined },
    }, {
      onSuccess: onClose,
      onError: () => setError('수정에 실패했습니다. 날짜 구간(종료일 ≥ 시작일)과 권한을 확인하세요.'),
    });
  };

  return (
    <ModalShell title="이벤트 수정 (전체 필드)" onClose={onClose}>
      <form onSubmit={submit} className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="제목 *"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="유형">
          <select className="input" value={type} onChange={(e) => setType(e.target.value as EventType)}>
            {EVENT_TYPES.map((t) => (<option key={t} value={t}>{eventLabel[t]}</option>))}
          </select>
        </Field>
        <Field label="우선순위">
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as EventPriority)}>
            {EVENT_PRIORITIES.map((p) => (<option key={p} value={p}>{priorityLabel[p]}</option>))}
          </select>
        </Field>
        <Field label="시작일 *"><input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
        <Field label="종료일"><input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
        <Field label="메모"><input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
        <div className="sm:col-span-2 flex items-center justify-end gap-3 pt-1">
          {error && <span className="text-sm text-danger mr-auto" role="alert">{error}</span>}
          <button type="button" className="btn" onClick={onClose}>취소</button>
          <button type="submit" className="btn btn-primary" disabled={update.isPending}>{update.isPending ? '저장 중…' : '저장'}</button>
        </div>
      </form>
    </ModalShell>
  );
}

// [B5 2026-07-16] export — 캘린더 학원 일정 스트립의 인라인 추가가 같은 폼을 재사용(사설 사본 금지).
export function EventForm({ compact = false, onDone }: { compact?: boolean; onDone?: () => void } = {}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<EventType>('notice');
  const [priority, setPriority] = useState<EventPriority>('normal');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');

  // 백엔드가 단일 소스 — 중앙 훅(useCreateEvent)이 성공 시 qk.events 무효화 → 재패칭이 store를 갱신.
  const create = useCreateEvent();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startDate) return;
    const end = endDate || startDate;
    // 캘린더 구간 무결성: 클라이언트에서도 선검증(서버도 400으로 재검증).
    if (end < startDate) { setError('종료일은 시작일 이후여야 합니다.'); return; }
    create.mutate(
      { title: title.trim(), type, priority, startDate, endDate: end, memo: memo.trim() || undefined },
      {
        // [B6 C2 규격] 성공=폼 리셋, 실패=인라인 에러 — 중앙 훅은 무효화만, 화면 반응은 호출부 소관.
        onSuccess: () => {
          setTitle(''); setType('notice'); setPriority('normal'); setStartDate(''); setEndDate(''); setMemo(''); setError('');
          onDone?.(); // [B5] 인라인(캘린더) 사용 시 발행 후 접기
        },
        onError: () => setError('발행에 실패했습니다. 날짜 구간(종료일 ≥ 시작일)과 권한을 확인하세요.'),
      },
    );
  };

  return (
    <form onSubmit={submit} className={compact ? "p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-caption" : "p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"}>
      <Field label="제목 *"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="여름 특강 등록 시작" /></Field>
      <Field label="유형">
        <select className="input" value={type} onChange={(e) => setType(e.target.value as EventType)}>
          {EVENT_TYPES.map((t) => (<option key={t} value={t}>{eventLabel[t]}</option>))}
        </select>
      </Field>
      <Field label="우선순위 (중요=학생 기본 노출)">
        <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as EventPriority)}>
          {EVENT_PRIORITIES.map((p) => (<option key={p} value={p}>{priorityLabel[p]}</option>))}
        </select>
      </Field>
      <Field label="시작일 *"><input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
      <Field label="종료일"><input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
      <Field label="메모"><input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="비고" /></Field>
      <div className={compact ? "sm:col-span-2 flex items-center justify-end gap-3" : "lg:col-span-3 flex items-center justify-end gap-3"}>
        {error && <span className="text-sm text-danger">{error}</span>}
        <button type="submit" className="btn btn-primary" disabled={create.isPending}>
          {create.isPending ? '발행 중…' : '이벤트 발행'}
        </button>
      </div>
    </form>
  );
}
