'use client';
// [강사 출결 상세] 특정 강사의 회차별 상세 출결. 관리자 전용.
//  참조 무결성 원칙:
//   · 데이터 단일 소스 = 권위 엔드포인트 /schedule(서버가 instructorId로 필터) — 세션 복제·별도 store 없음.
//   · instructorId 유효성 검증(강사 목록에 없으면 '찾을 수 없음') — 유령 참조 차단.
//   · [TBO-68 C1] 카운트·출석률·인정 시수 = **서버 summary 정본 소비**(instructor-attendance-summary,
//     instructorId 필터) — 종전 로컬 재계산(counts/rate/paidTeachingHours) 사본 제거. 행 배지만 술어.
//   · 읽기 전용(진실원은 세션·출석부) — 편집은 출석부/캘린더에서.
import { Fragment, useMemo, useState } from 'react';
import { payoutHours as hoursLabel } from '@/features/payouts/payout-shared'; // [감사 3] 시수 표기 단일화
import Link from 'next/link';
import type { AttendanceStatus, InstructorAttendanceStatus } from '@/types';
import { EmptyState, LoadingState, PageHeader, SectionCard, StatCard, TableWrap } from '@/components/ui';
import { useInstructors, useInstructorSessions, useInstructorAttendanceSummary, useInstructorAttendanceLedger, useUpdateSchedule, useAttendance, useUpsertAttendance } from '@/lib/queries';
import { useAccountAccess } from '@/lib/useAccountAccess';
import { countsForPay, WEEKDAYS_KO as WD } from '@/lib/domain/schedule';
import { AttMarker, INSTRUCTOR_ATT_OPTIONS, STUDENT_ATT_OPTIONS } from './AttMarker';
import { AccountingImpactModal } from '@/components/AccountingImpactModal';
import { DateRangeControl } from '@/components/DateRangeControl';
import { currentMonthKst, monthRangeKst, shiftMonth } from '@/lib/format';
import { STAFF_ATTENDANCE_LABEL } from '@/lib/domain/staff-attendance';

export function InstructorAttendanceDetailView({ instructorId }: { instructorId: number }) {
  const admin = useAccountAccess().can('admin.area');
  const { data: instructors = [], isLoading: loadingInst } = useInstructors();
  // [req3] 매니저 CRUD — 강사 출결(세션 PATCH)·학생 출결(attendance upsert). 상세=지난 회차 편집 진입점.
  const updateSchedule = useUpdateSchedule();
  const { data: attendance = [] } = useAttendance();
  const upsert = useUpsertAttendance();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggleExpand = (id: number) => setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const markInst = (sid: number, st: InstructorAttendanceStatus) => updateSchedule.mutate({ id: sid, body: { instructorAttendance: st } });
  const clearInst = (sid: number) => updateSchedule.mutate({ id: sid, body: { clearInstructorAttendance: true } });
  const attOf = (sid: number, stuId: number): AttendanceStatus | undefined => attendance.find((a) => a.sessionId === sid && a.studentId === stuId)?.status;
  const markStu = (sid: number, stuId: number, st: AttendanceStatus) => upsert.mutate({ sessionId: sid, studentId: stuId, status: st });
  const [mode, setMode] = useState<'month' | 'custom'>('month');
  const [ym, setYm] = useState(currentMonthKst());
  const [custom, setCustom] = useState(() => monthRangeKst(currentMonthKst()));
  const range = mode === 'month' ? monthRangeKst(ym) : custom;

  const { data: sessions = [], isLoading } = useInstructorSessions(admin ? instructorId : null, range.from, range.to);
  // [TBO-68 C1] 통계는 서버 summary 정본(qk.schedule 하위 — 아래 출결 마킹 mutation이 자동 무효화).
  const { data: summary } = useInstructorAttendanceSummary(range.from, range.to, instructorId);
  const { data: ledger } = useInstructorAttendanceLedger({ from: range.from, to: range.to, instructorId });

  // 참조 무결성: 유효한 강사인지 검증(목록 로딩 후에만 판정).
  const instructor = instructors.find((i) => Number(i.id) === instructorId);

  // 진행 회차(held·makeup) = 마킹 대상(행 목록은 세션 데이터 그대로 — 통계만 서버).
  const held = useMemo(
    () => sessions.filter((s) => s.status === 'held' || s.status === 'makeup').sort((a, b) => (a.sessionDate + (a.startTime ?? '')).localeCompare(b.sessionDate + (b.startTime ?? ''))),
    [sessions],
  );
  // 기간 내 회차가 없으면 서버 rows에 해당 강사 행이 없다 → 0/—로 표기(사본 재계산 금지).
  const stat = summary?.rows.find((r) => Number(r.instructorId) === instructorId);
  const counts = { present: stat?.present ?? 0, late: stat?.late ?? 0, absent: stat?.absent ?? 0 };
  const rate = stat?.attendanceRate ?? null;
  const hours = stat?.teachingHours ?? 0;

  const navMonth = (d: number) => setYm((current) => shiftMonth(current, d));
  const staffDays = ledger?.entries.filter((entry) => entry.source === 'staff_day') ?? [];
  const leaveDays = staffDays.filter((entry) => ['paid_leave', 'unpaid_leave', 'sick_leave'].includes(entry.status)).length;

  if (!admin) {
    return (
      <div className="p-6 max-w-page-form mx-auto">
        <PageHeader title="강사 출결 상세" sub="관리자(매니저 이상)만 열람할 수 있습니다." />
        <Link href="/" className="btn btn-primary">대시보드로</Link>
      </div>
    );
  }
  // 참조 무결성: 강사 목록 로딩 완료 후에도 없으면 유령 id → 안내.
  if (!loadingInst && !instructor) {
    return (
      <div className="p-6 max-w-page-form mx-auto">
        <Link href="/" className="text-caption text-fg-muted hover:underline">← 대시보드</Link>
        <PageHeader title="강사 출결 상세" sub={`강사(id ${instructorId})를 찾을 수 없습니다.`} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-page mx-auto space-y-6">
      <div>
        <Link href="/" className="text-caption text-fg-muted hover:underline">← 대시보드</Link>
        <PageHeader
          title={`${instructor?.name ?? `강사 #${instructorId}`} — 출결 상세`}
          sub="회차별 강사 출결·인정 시수 (읽기 전용 · 편집은 출석부)"
          actions={
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="flex rounded-md overflow-hidden border">
                {(['month', 'custom'] as const).map((k) => (
                  <button key={k} className={`btn btn-sm rounded-none border-0 ${mode === k ? 'badge-accent' : ''}`} onClick={() => setMode(k)}>{k === 'month' ? '월별' : '기간'}</button>
                ))}
              </div>
              {mode === 'month' ? (
                <>
                  <button className="btn btn-sm" onClick={() => navMonth(-1)}>◀</button>
                  <span className="mono text-body w-[70px] text-center">{ym}</span>
                  <button className="btn btn-sm" onClick={() => navMonth(1)}>▶</button>
                </>
              ) : (
                <DateRangeControl value={custom} onChange={setCustom} label="조회" />
              )}
              <Link href="/attendance" className="btn btn-sm">출석부에서 편집 →</Link>
            </div>
          }
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard label="진행 회차" value={`${stat?.held ?? held.length}회`} />
        <StatCard label="출석" value={`${counts.present}`} tone="success" />
        <StatCard label="지각" value={`${counts.late}`} tone="attention" />
        <StatCard label="결석" value={`${counts.absent}`} tone="danger" />
        <StatCard label="출석률" value={rate == null ? '—' : `${rate}%`} />
        <StatCard label="인정 시수" value={`${hours}h`} tone="accent" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="근무 기록" value={`${staffDays.length}건`} />
        <StatCard label="출근" value={`${staffDays.filter((entry) => entry.status === 'present').length}건`} tone="success" />
        <StatCard label="지각" value={`${staffDays.filter((entry) => entry.status === 'late').length}건`} tone="attention" />
        <StatCard label="휴가·병가" value={`${leaveDays}건`} tone="attention" />
      </div>

      <SectionCard title={`근무·휴가 이력 (${staffDays.length})`}>
        {!staffDays.length ? <EmptyState compact message="해당 기간의 근무·휴가 기록이 없습니다." /> : (
          <TableWrap>
            <table className="table text-body">
              <thead><tr><th>업무일</th><th>상태</th><th>출퇴근</th><th>메모</th></tr></thead>
              <tbody>
                {staffDays.map((entry) => (
                  <tr key={entry.key}>
                    <td className="mono">{entry.date}</td>
                    <td>{STAFF_ATTENDANCE_LABEL[entry.status as keyof typeof STAFF_ATTENDANCE_LABEL]}</td>
                    <td className="mono text-fg-muted">{entry.startTime ?? '—'}{entry.endTime ? `~${entry.endTime}` : ''}</td>
                    <td className="text-fg-muted">{entry.memo ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </SectionCard>

      <SectionCard title={`회차 상세 (${held.length})`}>
        {isLoading ? (
          /* [B6 C3 2026-07-16] 로드 중 EmptyState 오용 → LoadingState(skeleton) 규격 */
          <LoadingState />
        ) : !held.length ? (
          <EmptyState message="해당 기간에 진행된 회차가 없습니다." />
        ) : (
          <TableWrap>
            <table className="table text-body">
              <thead>
                <tr>
                  <th className="min-w-[110px]">날짜</th>
                  <th className="min-w-[90px]">시간</th>
                  <th>과목 · 코스</th>
                  <th className="min-w-[90px]">강의실</th>
                  <th className="text-center min-w-[80px]">강사 출결</th>
                  <th className="text-center min-w-[90px]">시수 인정</th>
                </tr>
              </thead>
              <tbody>
                {held.map((s) => {
                  const paid = countsForPay(s);
                  const isOpen = expanded.has(s.id);
                  const cohort = (s.studentIds ?? []).map((id, i) => ({ id: Number(id), name: s.studentNames?.[i] ?? `학생#${id}` }));
                  return (
                    <Fragment key={s.id}>
                      <tr>
                        <td className="mono">
                          <button type="button" className="mr-1 text-fg-subtle hover:text-accent" onClick={() => toggleExpand(s.id)} title={`학생 출결 ${isOpen ? '접기' : '펼치기'} (${cohort.length}명)`}>{isOpen ? '▾' : '▸'}</button>
                          {s.sessionDate} <span className="text-fg-subtle">({WD[s.weekday]})</span>
                        </td>
                        <td className="mono text-fg-muted">{s.startTime ?? '—'}</td>
                        <td>{s.subjectName} · <span className="text-fg-muted">{s.courseName}</span></td>
                        <td className="text-fg-muted">{s.roomName ?? '—'}</td>
                        <td className="text-center">
                          {/* [req3] 강사 출결 CRUD(버튼·원클릭·수정하기) — 관리자만 */}
                          <AttMarker value={s.instructorAttendance} options={INSTRUCTOR_ATT_OPTIONS} canEdit={admin} pending={updateSchedule.isPending} onMark={(st) => markInst(s.id, st)} onClear={() => clearInst(s.id)} />
                        </td>
                        <td className="text-center">
                          {paid ? (
                            <span className="mono text-success">{hoursLabel(s.durationMinutes)}</span>
                          ) : (
                            <span className="text-fg-subtle text-caption">제외{s.instructorAttendance === 'absent' ? '(결석)' : s.status === 'makeup' ? '(보강)' : ''}</span>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={6} className="bg-canvas-subtle">
                            {/* [req3] 이 회차의 학생 출결 CRUD(관리자) — 코호트=세션 studentIds(enrollment 파생·단일 소스) */}
                            <div className="p-2 space-y-1.5">
                              <div className="text-caption font-semibold text-fg-muted">학생 출결 ({cohort.length}명)</div>
                              {!cohort.length ? (
                                /* [B6 C3 2026-07-16] 자체 div 빈 상태 → EmptyState 규격(compact) */
                                <EmptyState compact message="배정된 학생이 없습니다." />
                              ) : (
                                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                                  {cohort.map((st) => (
                                    <span key={st.id} className="inline-flex items-center gap-1.5 text-caption">
                                      <span className="min-w-[64px] truncate font-medium">{st.name}</span>
                                      <AttMarker value={attOf(s.id, st.id)} options={STUDENT_ATT_OPTIONS} canEdit={admin} pending={upsert.isPending} onMark={(v) => markStu(s.id, st.id, v)} />
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
        <p className="text-caption text-fg-subtle mt-2">시수 인정 = 진행(held)·강사 결석 아님(정산과 동일 규칙). 보강·결석·미진행은 제외(잠정).</p>
      </SectionCard>
      <AccountingImpactModal prompt={updateSchedule.accountingPrompt} onClose={updateSchedule.dismissAccountingPrompt} onConfirm={updateSchedule.confirmAccountingImpact} />
    </div>
  );
}
