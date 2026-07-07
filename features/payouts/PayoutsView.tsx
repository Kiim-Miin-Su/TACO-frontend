'use client';
import { Fragment, useCallback, useState } from 'react';
import { Badge, EmptyState, Field, PageHeader, PromptModal, SectionCard, TableWrap, type Tone } from '@/components/ui';
import { useTacoStore } from '@/lib/store';
import {
  useSchedule, useCourses, useSubjects, useEnrollments, useStudents,
  useInstructors, usePayouts, usePayoutPreview,
  useGeneratePayout, useConfirmPayout, usePayPayout, useAdjustPayout, useRejectPayout,
} from '@/lib/queries';
import { isAdmin } from '@/lib/roles';
import { won } from '@/lib/format';
import type { PayoutRow, PayoutRowStatus, PayoutLine } from '@/lib/api';
import { ReasonModal } from '@/components/ReasonModal';

const statusLabel: Record<PayoutRowStatus, string> = {
  pending: '승인대기', confirmed: '승인됨', paid: '지급완료', rejected: '반려',
};
const statusTone: Record<PayoutRowStatus, Tone> = {
  pending: 'attention', confirmed: 'accent', paid: 'success', rejected: 'danger',
};
const hours = (min?: number) => `${((min ?? 0) / 60).toFixed(1)}h`;

// 기본 산정 기간 = 이번 달 1일~말일(하드코딩 금지 — DESIGN §8 공통)
const pad2 = (n: number) => String(n).padStart(2, '0');
const monthRange = () => {
  const d = new Date();
  const y = d.getFullYear(), m = d.getMonth();
  return {
    from: `${y}-${pad2(m + 1)}-01`,
    to: `${y}-${pad2(m + 1)}-${pad2(new Date(y, m + 1, 0).getDate())}`,
  };
};

export function PayoutsView() {
  const role = useTacoStore((s) => s.currentRole);
  const admin = isAdmin(role);
  // 정산 근거를 사람이 읽을 수 있게 — 세션→시각, 코스→과목, 코스→수강 학생 조인(Query 훅).
  const { data: classSessions = [] } = useSchedule();
  const { data: courses = [] } = useCourses();
  const { data: subjects = [] } = useSubjects();
  const { data: enrollments = [] } = useEnrollments();
  const { data: students = [] } = useStudents();
  const lineDetail = useCallback((line: PayoutLine) => {
    const ses = classSessions.find((s) => s.id === line.sessionId);
    const course = courses.find((c) => c.id === line.courseId);
    const subjectName = subjects.find((su) => su.id === course?.subjectId)?.name ?? '—';
    const studentNames = enrollments
      .filter((e) => e.courseId === line.courseId)
      .map((e) => students.find((s) => s.id === e.studentId)?.name)
      .filter(Boolean).join(', ') || '—';
    return { startTime: ses?.startTime ?? '', subjectName, studentNames };
  }, [classSessions, courses, subjects, enrollments, students]);
  const [expanded, setExpanded] = useState<number | null>(null);

  // [상태 무결성 2026-07-06] 서버 데이터는 TanStack Query 단일 소스 — 로컬 useState 복사 제거.
  //  usePayouts는 관리자 게이트(비관리자 fetch 생략), mutation 성공 시 qk.payouts.all 무효화로 자동 최신화.
  const payoutsQ = usePayouts();
  const instructorsQ = useInstructors();
  const payouts = payoutsQ.data ?? [];
  const instructors = instructorsQ.data ?? [];
  const conn: 'checking' | 'online' | 'offline' =
    payoutsQ.isError || instructorsQ.isError ? 'offline'
    : payoutsQ.isSuccess ? 'online' : 'checking';

  const [instructorId, setInstructorId] = useState('');
  const [{ from: defFrom, to: defTo }] = useState(monthRange);
  const [start, setStart] = useState(defFrom);
  const [end, setEnd] = useState(defTo);
  // 산정 미리보기(읽기전용) — 강사·기간 키의 쿼리(캐시·중복요청 제거)
  const previewQ = usePayoutPreview(instructorId ? Number(instructorId) : null, start, end);
  const preview = previewQ.data ?? null;

  // 필터 — 정산 목록(강사·상태) / 적격 수업 내역(수업)
  const [fInstructor, setFInstructor] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fCourse, setFCourse] = useState('');

  const instructorName = useCallback(
    (id: number) => instructors.find((i) => i.id === id)?.name ?? `강사 ${id}`,
    [instructors],
  );

  // [C-1] alert 대체 — 하단 토스트(에러/검증). 리로드는 invalidateQueries가 담당.
  const [toast, setToast] = useState('');
  const onErr = (e: unknown) => {
    const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
    setToast(`처리 실패: ${msg ?? String(e)}`);
  };
  const generateM = useGeneratePayout();
  const confirmM = useConfirmPayout();
  const payM = usePayPayout();
  const adjustM = useAdjustPayout();
  const rejectM = useRejectPayout();
  const busy = generateM.isPending || confirmM.isPending || payM.isPending || adjustM.isPending || rejectM.isPending;

  const generate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!instructorId) return;
    generateM.mutate({ instructorId: Number(instructorId), from: start, to: end }, { onError: onErr });
  };
  // [DESIGN §5.5] 급여 수정 — prompt 2연타 대신 금액+사유 한 화면 모달
  const [adjustModal, setAdjustModal] = useState<PayoutRow | null>(null);
  // 반려 사유 모달(입력/보기)
  const [reasonModal, setReasonModal] = useState<{ mode: 'input' | 'view'; payout: PayoutRow } | null>(null);

  // [코드리뷰 2026-07-03 M1] 비관리자 접근 안내 — 백엔드 403과 일치하는 프론트 게이트(메뉴는 Sidebar에서 숨김, 직접 URL 접근 대비)
  if (!admin) {
    return (
      <div className="p-6 max-w-page mx-auto">
        <PageHeader title="강사 페이" />
        <div className="p-4 rounded-lg border text-body text-fg-muted border-line-muted">
          정산 정보는 관리자 전용입니다. 본인 정산 조회 기능은 준비 중입니다.
        </div>
      </div>
    );
  }

  if (conn === 'offline') {
    return (
      <div className="p-6 max-w-page mx-auto">
        <PageHeader title="강사 페이" />
        <div className="p-4 rounded-lg border text-body text-fg-muted border-line-muted">
          백엔드 API에 연결할 수 없습니다. 로컬은 <span className="mono">cd backend &amp;&amp; npm run dev</span>, 배포는 <span className="mono">NEXT_PUBLIC_API_URL</span>를 확인하세요.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-page mx-auto space-y-6">
      <PageHeader
        title="강사 페이"
        sub="시수 × 코스 시급으로 산정(진행 완료 + 보고서 승인분만) · 생성 → 승인 → 지급"
        actions={<Badge tone={conn === 'online' ? 'success' : 'neutral'}>{conn === 'online' ? '실시간 API' : '확인 중…'}</Badge>}
      />

      <SectionCard title="정산 산정 · 정산서 생성">
        <form onSubmit={generate} className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <Field label="강사 *">
            <select className="input" value={instructorId} onChange={(e) => setInstructorId(e.target.value)}>
              <option value="">선택</option>
              {instructors.map((i) => (<option key={i.id} value={i.id}>{i.name}</option>))}
            </select>
          </Field>
          <Field label="시작일"><input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="종료일"><input type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          <button type="submit" className="btn btn-primary h-8" disabled={!instructorId || busy || !preview?.sessionCount}>정산서 생성</button>
          {instructorId && (
            <div className="sm:col-span-4 text-body text-fg-muted">
              {preview && preview.sessionCount > 0 ? (
                <>미리보기 — 적격 수업 <b>{preview.sessionCount}</b>회 · 시수 <b>{hours(preview.totalMinutes)}</b> · 산정액 <b className="text-fg">{won(preview.computedAmount)}</b></>
              ) : (
                <span className="text-fg-subtle">해당 기간에 정산 대상(진행 완료 + 승인 보고서)이 없습니다.</span>
              )}
            </div>
          )}
        </form>
      </SectionCard>

      {preview && preview.sessionCount > 0 && (() => {
        const courseOpts = Array.from(new Map(preview.lines.map((l) => [l.courseId, l.courseName])).entries());
        const lines = fCourse ? preview.lines.filter((l) => String(l.courseId) === fCourse) : preview.lines;
        const subTotal = lines.reduce((a, l) => a + l.amount, 0);
        return (
        <SectionCard
          title={`적격 수업 내역 (${lines.length}건)`}
          action={
            <select className="input h-8 w-40" value={fCourse} onChange={(e) => setFCourse(e.target.value)}>
              <option value="">전체 수업</option>
              {courseOpts.map(([id, name]) => (<option key={id} value={id}>{name}</option>))}
            </select>
          }
        >
          <TableWrap minWidth={640}>
          <table className="table">
            <thead>
              <tr><th>일시</th><th>과목</th><th>수업</th><th>학생</th><th className="text-right">시수</th><th className="text-right">페이</th></tr>
            </thead>
            <tbody>
              {lines.map((r) => {
                const d = lineDetail(r);
                return (
                  <tr key={r.sessionId}>
                    <td className="mono whitespace-nowrap">{r.sessionDate}{d.startTime ? ` ${d.startTime}` : ''}</td>
                    <td className="text-fg-muted">{d.subjectName}</td>
                    <td className="font-medium">{r.courseName}</td>
                    <td className="text-fg-muted">{d.studentNames}</td>
                    <td className="text-right mono">{(r.durationMinutes / 60).toFixed(1)}h</td>
                    <td className="text-right mono">{won(r.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="text-right text-caption text-fg-muted">소계{fCourse ? ' (필터)' : ''}</td>
                <td className="text-right mono font-semibold">{won(subTotal)}</td>
              </tr>
            </tfoot>
          </table>
          </TableWrap>
        </SectionCard>
        );
      })()}

      {(() => {
        const filtered = payouts.filter((p) =>
          (fInstructor ? p.instructorId === Number(fInstructor) : true) &&
          (fStatus ? p.status === fStatus : true),
        );
        return (
        <SectionCard
          title={`정산 목록 (${filtered.length})`}
          action={
            <div className="flex gap-1.5">
              <select className="input h-8 w-28" value={fInstructor} onChange={(e) => setFInstructor(e.target.value)}>
                <option value="">전체 강사</option>
                {instructors.map((i) => (<option key={i.id} value={i.id}>{i.name}</option>))}
              </select>
              <select className="input h-8 w-28" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                <option value="">전체 상태</option>
                <option value="pending">승인대기</option>
                <option value="confirmed">승인됨</option>
                <option value="paid">지급완료</option>
                <option value="rejected">반려</option>
              </select>
            </div>
          }
        >
        <TableWrap minWidth={760}>
        <table className="table">
          <thead>
            <tr>
              <th>강사</th><th>기간</th><th className="text-right">시수</th><th className="text-right">금액</th><th>상태</th><th className="text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6}><EmptyState message="조건에 맞는 정산서가 없습니다." compact /></td></tr>
            )}
            {filtered.map((p) => (
              <Fragment key={p.id}>
              <tr>
                <td className="font-medium">
                  <button className="hover:underline" onClick={() => setExpanded(expanded === p.id ? null : p.id)} title="정산 근거 보기">
                    {expanded === p.id ? '▾' : '▸'} {instructorName(p.instructorId)}
                  </button>
                </td>
                <td className="mono text-fg-muted">{p.periodStart} ~ {p.periodEnd}</td>
                <td className="text-right mono">{hours(p.totalMinutes)} · {p.sessionCount}회</td>
                <td className="text-right mono">
                  {won(p.amount)}
                  {p.adjustedAmount != null && p.adjustedAmount !== p.computedAmount && (
                    <div className="text-micro text-fg-subtle">산정 {won(p.computedAmount)}</div>
                  )}
                </td>
                <td>
                  <Badge tone={statusTone[p.status]}>{statusLabel[p.status]}</Badge>
                  {p.status === 'rejected' && (
                    <button className="block text-micro text-danger mt-0.5 hover:underline" onClick={() => setReasonModal({ mode: 'view', payout: p })}>
                      반려 사유 보기
                    </button>
                  )}
                </td>
                <td className="text-right">
                  {!admin ? (
                    <span className="text-caption text-fg-subtle">{p.status === 'pending' ? '관리자 승인 대기' : '—'}</span>
                  ) : (
                    <div className="inline-flex gap-1.5 justify-end flex-wrap">
                      {p.status === 'pending' && (
                        <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => confirmM.mutate(p.id, { onError: onErr })}>승인</button>
                      )}
                      {p.status === 'confirmed' && (
                        <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => payM.mutate(p.id, { onError: onErr })}>지급</button>
                      )}
                      {(p.status === 'pending' || p.status === 'confirmed') && (
                        <>
                          <button className="btn btn-sm" disabled={busy} onClick={() => setAdjustModal(p)}>급여수정</button>
                          <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => setReasonModal({ mode: 'input', payout: p })}>반려</button>
                        </>
                      )}
                      {(p.status === 'paid' || p.status === 'rejected') && (
                        <span className="text-caption text-fg-subtle mono">{p.paidAt ? p.paidAt.slice(0, 10) : '—'}</span>
                      )}
                    </div>
                  )}
                </td>
              </tr>
              {expanded === p.id && (
                <tr>
                  <td colSpan={6} className="bg-canvas-subtle">
                    <div className="p-2">
                      <div className="text-caption text-fg-muted mb-1">정산 근거 — 언제·과목·학생별 내역 ({p.lines.length}건)</div>
                      {p.lines.length === 0 ? (
                        <div className="text-caption text-fg-subtle px-1 py-2">연결된 수업 내역이 없습니다.</div>
                      ) : (
                        <table className="table">
                          <thead><tr><th>일시</th><th>과목</th><th>수업</th><th>학생</th><th className="text-right">시수</th><th className="text-right">페이</th></tr></thead>
                          <tbody>
                            {p.lines.map((l) => {
                              const d = lineDetail(l);
                              return (
                                <tr key={l.sessionId}>
                                  <td className="mono whitespace-nowrap">{l.sessionDate}{d.startTime ? ` ${d.startTime}` : ''}</td>
                                  <td className="text-fg-muted">{d.subjectName}</td>
                                  <td className="font-medium">{l.courseName}</td>
                                  <td className="text-fg-muted">{d.studentNames}</td>
                                  <td className="text-right mono">{(l.durationMinutes / 60).toFixed(1)}h</td>
                                  <td className="text-right mono">{won(l.amount)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
        </TableWrap>
        </SectionCard>
        );
      })()}
      <p className="text-caption text-fg-subtle">
        시수는 <b>진행 완료(held) + 보고서 승인</b>분만 채워지며, 세션은 한 정산서에만 연결됩니다(이중 계상 방지).
        지급 시 출금 거래 원장과 대시보드에 반영됩니다.
        {!admin && ' 승인·지급·수정은 관리자(대표) 역할에서 가능합니다.'}
      </p>

      {reasonModal && (
        <ReasonModal
          mode={reasonModal.mode}
          title={reasonModal.mode === 'input' ? `강사 페이 반려 — ${instructorName(reasonModal.payout.instructorId)}` : '반려 사유'}
          initial={reasonModal.payout.rejectedReason ?? ''}
          onClose={() => setReasonModal(null)}
          onSubmit={(reason) => { const p = reasonModal.payout; setReasonModal(null); rejectM.mutate({ id: p.id, reason }, { onError: onErr }); }}
        />
      )}

      {/* [DESIGN §5.5] 급여 수정 — window.prompt 2연타 대체(금액+사유 한 화면) */}
      {adjustModal && (
        <PromptModal
          title={`급여 수정 — ${instructorName(adjustModal.instructorId)} (자동 산정 ${won(adjustModal.computedAmount)})`}
          fields={[
            { name: 'amount', label: '실효 지급액(원)', type: 'number', required: true, initial: String(adjustModal.amount) },
            { name: 'reason', label: '수정 사유(선택)', initial: adjustModal.adjustReason ?? '', hint: '강사에게 표시됩니다' },
          ]}
          submitLabel="수정"
          onClose={() => setAdjustModal(null)}
          onSubmit={(v) => {
            const p = adjustModal;
            const amount = Number(v.amount);
            if (!Number.isFinite(amount) || amount < 0) { setToast('금액이 올바르지 않습니다'); return; }
            setAdjustModal(null);
            adjustM.mutate({ id: p.id, amount, reason: v.reason || undefined }, { onError: onErr });
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg shadow-lg text-body text-white flex items-center gap-2"
          style={{ background: 'var(--color-danger)' }} role="status">
          <span>{toast}</span>
          <button onClick={() => setToast('')} className="opacity-80 hover:opacity-100" aria-label="닫기">✕</button>
        </div>
      )}
    </div>
  );
}
