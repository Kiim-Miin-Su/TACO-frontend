'use client';
// [TBO-64 2026-07-24] 시수 워크시트 — 대표 지시 10항목의 관리자 화면.
//  강사·기간(부모 폼 공유) → 회차 테이블: 강사 출결(AttMarker — 기존 PATCH 재사용, 회계 영향
//  ack 모달 동일 규약) · 참가자별 학생 출결(AttMarker — PUT attendance 재사용, 자동 held 전이
//  동일 적용) · 리포트 상태 · 금액(auto=시급×시간 기본값 / 지각·리포트 미작성=빈칸 입력 → 책정 /
//  excluded=사유) · 합계(총 시수·자동 합·책정 합·총액·미책정 N). 판정은 전부 서버(단일 진실원 —
//  payout-worksheet.policy)이고 이 컴포넌트는 표시·명령만 한다.
import { useState } from 'react';
import Link from 'next/link';
import { Badge, EmptyState, LoadingState, SectionCard, TableWrap, type Tone } from '@/components/ui';
import { usePayoutWorksheet, useSetSessionPayAmount, useUpdateSchedule, useUpsertAttendance } from '@/lib/queries';
import type { PayoutWorksheetRow } from '@/lib/api';
import type { AttendanceStatus, InstructorAttendanceStatus } from '@/types';
import { AttMarker, INSTRUCTOR_ATT_OPTIONS, STUDENT_ATT_OPTIONS } from '@/features/attendance/AttMarker';
import { AccountingImpactModal } from '@/components/AccountingImpactModal';

const won = (v: number) => `₩${v.toLocaleString()}`;
const hoursOf = (min: number) => `${Math.round((min / 60) * 100) / 100}h`;

const MANUAL_REASON_LABEL: Record<string, string> = {
  late: '지각',
  report_incomplete: '리포트 미작성/미승인',
  roster_missing: '수강생 확인 불가',
  rate_missing: '시급 미설정',
};
const EXCLUDED_LABEL: Record<string, string> = {
  not_held: '미진행(시수 제외)',
  instructor_absent: '강사 결석(시수 제외)',
  payout_linked: '정산 연결됨',
};
const REPORT_LABEL: Record<string, { label: string; tone: Tone }> = {
  approved: { label: '승인', tone: 'success' },
  submitted: { label: '제출', tone: 'accent' },
  rejected: { label: '반려', tone: 'danger' },
  draft: { label: '임시', tone: 'neutral' },
};

function AmountCell({ row }: { row: PayoutWorksheetRow }) {
  const setAmount = useSetSessionPayAmount();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const p = row.pricing;

  if (p.kind === 'excluded') {
    return <span className="text-caption text-fg-subtle">{EXCLUDED_LABEL[p.excludedReason ?? ''] ?? '제외'}</span>;
  }
  const save = () => {
    const amount = value.trim() === '' ? null : Number(value);
    if (amount != null && (!Number.isInteger(amount) || amount < 0)) return;
    setAmount.mutate({ id: row.sessionId, amount }, { onSuccess: () => setEditing(false) });
  };
  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          type="number" min={0} step={1000} autoFocus
          className="input h-7 w-28 text-right mono"
          placeholder={p.autoAmount != null ? String(p.autoAmount) : '금액(원)'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        />
        <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={setAmount.isPending}>저장</button>
        <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>취소</button>
      </span>
    );
  }
  if (p.effectiveAmount == null) {
    // 빈칸(대표 지시 ⑧) — 지각·리포트 미작성 등은 매니저/대표가 금액 책정
    return (
      <button type="button" className="btn btn-sm" onClick={() => { setValue(''); setEditing(true); }}>
        금액 책정
      </button>
    );
  }
  return (
    <button
      type="button"
      className="mono hover:underline"
      title={p.overrideAmount != null ? '책정가(클릭해 수정 — 비우면 해제)' : '자동 기본값(클릭해 수동 책정)'}
      onClick={() => { setValue(p.overrideAmount != null ? String(p.overrideAmount) : ''); setEditing(true); }}
    >
      {won(p.effectiveAmount)}{p.overrideAmount != null && <span className="text-caption text-accent ml-1">책정</span>}
    </button>
  );
}

export function PayoutWorksheet({ instructorId, from, to }: { instructorId: number | null; from: string; to: string }) {
  const ws = usePayoutWorksheet(instructorId, from, to);
  const updateSchedule = useUpdateSchedule();
  const upsert = useUpsertAttendance();

  if (instructorId == null) return null;
  const data = ws.data;
  return (
    <SectionCard title="시수 워크시트 (회차별 출결·금액 확정)">
      {ws.isPending ? (
        <LoadingState />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState message="해당 기간에 회차가 없습니다." />
      ) : (
        <>
          <TableWrap minWidth={880}>
            <table className="table">
              <thead>
                <tr>
                  <th>일시</th><th>수업</th><th className="text-right">시수</th>
                  <th>강사 출결</th><th>학생 출결 · 리포트</th><th className="text-right">금액</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.sessionId} className={row.pricing.kind === 'excluded' ? 'opacity-60' : undefined}>
                    <td className="mono whitespace-nowrap">
                      <Link href={`/sessions/${row.sessionId}`} className="hover:underline">
                        {row.sessionDate}{row.startTime ? ` ${row.startTime}` : ''}
                      </Link>
                    </td>
                    <td>
                      <span className="font-medium">{row.courseName}</span>
                      {row.hourlyRate != null && <span className="text-caption text-fg-subtle ml-1">₩{row.hourlyRate.toLocaleString()}/h</span>}
                      {row.pricing.kind === 'manual' && (
                        <span className="block text-caption text-warning">
                          {row.pricing.manualReasons.map((reason) => MANUAL_REASON_LABEL[reason] ?? reason).join(' · ')} — 책정 필요
                        </span>
                      )}
                    </td>
                    <td className="text-right mono">{hoursOf(row.durationMinutes)}</td>
                    <td>
                      {/* 강사 출결 CRUD(⑥) — 기존 PATCH 재사용(회계 영향 ack 모달 공유) */}
                      <AttMarker
                        value={(row.instructorAttendance ?? undefined) as InstructorAttendanceStatus | undefined}
                        options={INSTRUCTOR_ATT_OPTIONS}
                        canEdit={row.pricing.excludedReason !== 'payout_linked'}
                        pending={updateSchedule.isPending}
                        onMark={(st) => updateSchedule.mutate({ id: row.sessionId, body: { instructorAttendance: st } })}
                        onClear={() => updateSchedule.mutate({ id: row.sessionId, body: { clearInstructorAttendance: true } })}
                      />
                    </td>
                    <td>
                      {row.participants.length === 0 ? (
                        <span className="text-caption text-fg-subtle">수강생 없음</span>
                      ) : row.participants.map((participant) => {
                        const report = participant.reportApproval ? REPORT_LABEL[participant.reportApproval] : null;
                        return (
                          <div key={participant.studentId} className="flex items-center gap-2 py-0.5 flex-wrap">
                            <span className="min-w-[64px]">{participant.name}</span>
                            <AttMarker
                              value={(participant.attendance ?? undefined) as AttendanceStatus | undefined}
                              options={STUDENT_ATT_OPTIONS}
                              canEdit={row.pricing.excludedReason !== 'payout_linked'}
                              pending={upsert.isPending}
                              onMark={(st) => upsert.mutate({ sessionId: row.sessionId, studentId: participant.studentId, status: st })}
                            />
                            <Badge tone={report?.tone ?? 'neutral'}>{report ? `리포트 ${report.label}` : '리포트 미작성'}</Badge>
                          </div>
                        );
                      })}
                    </td>
                    <td className="text-right"><AmountCell row={row} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="text-caption text-fg-muted">
                    합계 — 포함 {data.totals.includedCount}/{data.totals.sessionCount}회
                    {data.totals.unpricedCount > 0 && <b className="text-warning"> · 책정 필요 {data.totals.unpricedCount}건(합계 미포함)</b>}
                    {data.totals.excludedCount > 0 && <span> · 제외 {data.totals.excludedCount}건</span>}
                  </td>
                  <td className="text-right mono">{hoursOf(data.totals.totalMinutes)}</td>
                  <td colSpan={2} className="text-right text-caption text-fg-muted">
                    자동 {won(data.totals.autoAmount)} + 책정 {won(data.totals.manualAmount)}
                  </td>
                  <td className="text-right mono font-bold">{won(data.totals.totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </TableWrap>
          <p className="text-caption text-fg-subtle mt-2 px-1">
            기본값 = 시급×시간(자동). <b>지각·리포트 미작성 회차는 빈칸</b> — 금액을 책정해야 합계·정산에
            포함됩니다. 출결 수정은 출석부·세션 상세와 같은 데이터(단일 소스)이며, 정산서 생성 시 확정
            금액이 그대로 스냅샷됩니다.
          </p>
          <AccountingImpactModal prompt={updateSchedule.accountingPrompt} onClose={updateSchedule.dismissAccountingPrompt} onConfirm={updateSchedule.confirmAccountingImpact} />
        </>
      )}
    </SectionCard>
  );
}
