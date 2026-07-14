'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ConfirmModal, EmptyState, SectionCard, TableWrap } from '@/components/ui';
import { useTacoStore } from '@/lib/store';
import {
  useInstructors,
  useExpenses,
  usePayouts,
  useReports,
  useStudents,
  useSchedule,
  useCourses,
  useApproveReport,
  useRejectReport,
  useApproveExpense,
  useRejectExpense,
  useConfirmPayout,
  useRejectPayout,
  useScheduleRequests,
  useApproveScheduleRequest,
  useRejectScheduleRequest,
} from '@/lib/queries';
import { won } from '@/lib/format';
import { isAdmin, roleLabel } from '@/lib/roles';
import { AdminHeader } from './AdminShell';
import { categoryLabel } from '@/features/expenses/labels';
import { api, type PendingAccount, type ScheduleRequestEx } from '@/lib/api';
import { currentClaims, getToken } from '@/lib/auth';
import { AVAILABILITY_KIND_LABEL, RECURRENCE_SCOPE_LABEL, WEEKDAY_LABEL } from '@/lib/domain/approvals';
import { ReasonModal } from '@/components/ReasonModal';
import { RequestDetailModal } from './RequestDetailModal';
import { ApprovalItemDetailModal, type ApprovalDetailItem } from './ApprovalItemDetailModal';
import type { AccountRole } from '@/types';

const ROLE_OPTS: AccountRole[] = ['instructor', 'manager', 'admin', 'super_admin'];

// 가입 승인 대기(백엔드 계정) — 이메일 인증 완료 후 대표가 승인하면 로그인 가능.
function MemberApprovals() {
  const [rows, setRows] = useState<PendingAccount[]>([]);
  const [roleSel, setRoleSel] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [memberReject, setMemberReject] = useState<number | null>(null); // [TBO-28B] 반려 사유 필수 모달

  // [C-2 2026-07-06] alive 게이터 주입 — 언마운트 후 setState 방지(초기 mount fetch가 늦게 도착하는 경우).
  //  decide()의 재조회는 사용자 액션(마운트 상태)이라 기본값(항상 alive)로 호출.
  const load = useCallback(async (isAlive: () => boolean = () => true) => {
    const token = getToken();
    if (!token) return;
    try { const r = await api.auth.pending(); if (isAlive()) setRows(r); }
    catch { if (isAlive()) setMsg('목록을 불러오지 못했습니다. (대표 권한 필요)'); }
  }, []);
  useEffect(() => {
    let alive = true;
    load(() => alive);
    return () => { alive = false; };
  }, [load]);

  // [TBO-28B] 승인=원자 tx(백엔드) — 동시 결정 시 409(이미 처리됨) 메시지 표면화. 반려=사유 필수(ReasonModal).
  async function decide(id: number, action: 'approve' | 'reject', reason?: string) {
    const token = getToken();
    if (!token) return;
    try {
      if (action === 'approve') await api.auth.approve(id, roleSel[id]);
      else await api.auth.reject(id, reason ?? '');
      setMsg(action === 'approve' ? '승인했습니다.' : '반려했습니다.');
      await load();
    } catch (e) {
      const status = (e as { response?: { status?: number } }).response?.status;
      setMsg(status === 409 ? '이미 처리된 계정입니다(목록을 새로고침했습니다).' : '처리 실패');
      await load();
    }
  }

  return (
    <SectionCard title={`가입 승인 대기 (${rows.length})`}>
      {msg && <div className="px-4 pt-3 text-caption text-accent">{msg}</div>}
      {rows.length === 0 ? (
        <EmptyState message="승인 대기 중인 가입 신청이 없습니다." />
      ) : (
        <TableWrap minWidth={760}>
        <table className="table">
          <thead><tr><th>아이디</th><th>이름</th><th>이메일</th><th>이메일 인증</th><th>역할 지정</th><th className="text-right"></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">{r.webId}</td>
                <td>{r.name}</td>
                <td className="text-fg-muted">{r.email}</td>
                <td>{r.emailVerified ? <span className="text-success">완료</span> : <span className="text-fg-subtle">미완료</span>}</td>
                <td>
                  <select className="input h-8 w-28" value={roleSel[r.id] ?? r.role}
                    onChange={(e) => setRoleSel((s) => ({ ...s, [r.id]: e.target.value }))}>
                    {ROLE_OPTS.map((ro) => <option key={ro} value={ro}>{roleLabel[ro]}</option>)}
                  </select>
                </td>
                <td className="text-right whitespace-nowrap">
                  <button className="btn btn-sm btn-primary mr-1.5" disabled={!r.emailVerified} onClick={() => decide(r.id, 'approve')} title={r.emailVerified ? '' : '이메일 인증 후 승인 가능'}>승인</button>
                  <button className="btn btn-sm btn-danger" onClick={() => setMemberReject(r.id)}>반려</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </TableWrap>
      )}
      {memberReject != null && (
        <ReasonModal
          mode="input"
          title="가입 반려 — 사유 필수"
          onClose={() => setMemberReject(null)}
          onSubmit={(reason) => { decide(memberReject, 'reject', reason); setMemberReject(null); }}
        />
      )}
    </SectionCard>
  );
}

// 승인 센터 = 관리자(매니저 이상). 단 가입 승인은 대표(super_admin) 전용.
export function ApprovalsView() {
  const currentRole = useTacoStore((s) => s.currentRole);
  const tokenRoles = currentClaims()?.roles ?? [];
  const roleForAccess: AccountRole =
    tokenRoles.includes('super_admin') ? 'super_admin'
    : tokenRoles.includes('admin') ? 'admin'
    : tokenRoles.includes('manager') ? 'manager'
    : tokenRoles.includes('instructor') ? 'instructor'
    : currentRole;
  const canManageApprovals = tokenRoles.length > 0 ? isAdmin(roleForAccess) : isAdmin(currentRole);
  const { data: instructors = [] } = useInstructors();
  const { data: expenses = [] } = useExpenses();
  const { data: instructorPayouts = [] } = usePayouts();
  const { data: sessionReports = [] } = useReports();
  const { data: students = [] } = useStudents();
  const { data: classSessions = [] } = useSchedule();
  const { data: courses = [] } = useCourses();
  const approveReport = useApproveReport();
  const rejectReport = useRejectReport();
  const approveExpense = useApproveExpense();
  const rejectExpense = useRejectExpense();
  const confirmPayout = useConfirmPayout();
  const rejectPayout = useRejectPayout();
  const isSuper = tokenRoles.includes('super_admin');
  const instructorName = (id?: number) => id != null ? instructors.find((i) => i.id === id)?.name ?? '—' : '—';

  const [reportReject, setReportReject] = useState<number | null>(null);
  const [expenseReject, setExpenseReject] = useState<number | null>(null);
  const [payoutReject, setPayoutReject] = useState<number | null>(null);
  const [detailItem, setDetailItem] = useState<ApprovalDetailItem | null>(null);
  // ── 수업 요청(TBO-16 #9) — 배지(lib/tasks)와 같은 useScheduleRequests 모집단(단일 구독) ──
  const { data: scheduleRequests = [] } = useScheduleRequests();
  const approveRequest = useApproveScheduleRequest();
  const rejectRequest = useRejectScheduleRequest();
  const approvingRequestId = approveRequest.isPending ? approveRequest.variables?.id : undefined;
  const [requestReject, setRequestReject] = useState<number | null>(null);
  const [requestMsg, setRequestMsg] = useState<string | null>(null);
  // [DESIGN §5.5] 충돌 강제 승인 확인 — window.confirm 대신 ConfirmModal
  const [forceApprove, setForceApprove] = useState<number | null>(null);
  // [C2C-b] 행 클릭 상세 모달(대표 지시) — 승인/반려는 아래 기존 핸들러를 그대로 전달(단일 구현)
  const [detailReq, setDetailReq] = useState<ScheduleRequestEx | null>(null);
  const pendingRequests = scheduleRequests.filter((r) => r.status === 'pending');
  // 승인 — 충돌 409면 force 재시도 확인(세션 생성과 동일 규약: 서버 createSession 재검사)
  const onApproveRequest = (r: ScheduleRequestEx) => {
    approveRequest.mutate({ id: r.id }, {
      onSuccess: () => setRequestMsg(
        r.requestKind === 'availability_upsert' || r.requestKind === 'availability_delete'
          ? '승인 — 가용시간 변경이 반영되었습니다.'
          : r.requestKind === 'session_update'
            ? '승인 — 수업 변경이 캘린더에 반영되었습니다.'
            : r.requestKind === 'session_delete'
              ? '승인 — 수업이 삭제되었습니다.'
              : '승인 — 캘린더에 세션이 생성되었습니다.',
      ),
      onError: (e) => {
        const err = e as { response?: { status?: number } };
        if (err.response?.status === 409 && (!r.requestKind || r.requestKind === 'session_create')) setForceApprove(r.id);
        else setRequestMsg('승인 보류 — 충돌을 확인하세요.');
      },
    });
  };
  const pendingExpenses = expenses.filter((e) => e.status === 'requested');
  const pendingPayouts = instructorPayouts.filter((p) => p.status === 'pending');
  // 작성완료(submitted)·미승인 리포트 — 승인 시 시수 적격으로 편입
  const pendingReports = sessionReports.filter((r) => (r.status === 'submitted' || r.approvalStatus === 'submitted') && r.approvalStatus !== 'approved');
  const studentName = (id: number) => students.find((s) => s.id === id)?.name ?? '—';
  const sessionInfo = (sid: number) => {
    const s = classSessions.find((x) => x.id === sid);
    if (!s) return '';
    const c = courses.find((x) => x.id === s.courseId)?.name ?? '수업';
    return `${c} · ${s.sessionDate} ${s.startTime ?? ''}`;
  };
  const requestTitle = (r: ScheduleRequestEx) => {
    if (r.requestKind === 'availability_upsert') {
      return `${AVAILABILITY_KIND_LABEL[r.availabilityKind ?? 'available']} 변경`;
    }
    if (r.requestKind === 'availability_delete') return '가용시간 삭제';
    if (r.requestKind === 'session_update') return '수업 변경';
    if (r.requestKind === 'session_delete') return '수업 삭제';
    return r.topic ?? courses.find((x) => x.id === r.courseId)?.name ?? '수업';
  };
  const requestWhen = (r: ScheduleRequestEx) => {
    if (r.requestKind === 'availability_upsert') {
      return `${r.availabilityWeekday != null ? WEEKDAY_LABEL[r.availabilityWeekday] : '-'} ${r.availabilityStartTime ?? ''}~${r.availabilityEndTime ?? ''}`;
    }
    if (r.requestKind === 'availability_delete') return `블록 #${r.targetAvailabilityId ?? '-'}`;
    if (r.requestKind === 'session_update') return `${r.sessionDate ?? '-'} ${r.startTime ?? ''}${r.endTime ? `~${r.endTime}` : ''}`;
    if (r.requestKind === 'session_delete') return `${r.sessionDate ?? '-'} ${r.startTime ?? ''}${r.endTime ? `~${r.endTime}` : ''}`;
    return `${r.sessionDate ?? '-'} ${r.startTime ?? ''}${r.endTime ? `~${r.endTime}` : ''}`;
  };
  const requestDetail = (r: ScheduleRequestEx) => {
    if (r.requestKind === 'availability_upsert' || r.requestKind === 'availability_delete') {
      const n = r.impactSessionIds?.length ?? 0;
      return r.changeSummary ?? `영향 수업 ${n}건`;
    }
    if (r.requestKind === 'session_update') {
      const scope = r.scope ? ` · ${RECURRENCE_SCOPE_LABEL[r.scope] ?? r.scope}` : '';
      const reason = r.requestReason ? ` · 사유: ${r.requestReason}` : '';
      return `${r.changeSummary ?? `세션 #${r.targetSessionId ?? '-'} 변경`}${scope}${reason}`;
    }
    if (r.requestKind === 'session_delete') return r.changeSummary ?? `세션 #${r.targetSessionId ?? '-'} 삭제`;
    return r.kind && r.kind !== 'class' ? (r.kind === 'level_test' ? '진단고사' : '상담') : '수업';
  };
  const approveDetailItem = (item: ApprovalDetailItem) => {
    setDetailItem(null);
    if (item.kind === 'report') approveReport.mutate({ id: item.row.id });
    else if (item.kind === 'expense') approveExpense.mutate(item.row.id);
    else confirmPayout.mutate(item.row.id);
  };
  const rejectDetailItem = (item: ApprovalDetailItem) => {
    setDetailItem(null);
    if (item.kind === 'report') setReportReject(item.row.id);
    else if (item.kind === 'expense') setExpenseReject(item.row.id);
    else setPayoutReject(item.row.id);
  };

  // 수업·가용시간 변경 요청 승인/반려는 BE가 manager 이상 허용(ADMIN_ROLES) — 섹션 컴포넌트로 분리해 재사용.
  const requestsSection = (
    <SectionCard title={`수업·가용시간 변경 요청 승인 대기 (${pendingRequests.length})`}>
      {requestMsg && <div className="px-4 pt-3 text-caption text-accent">{requestMsg}</div>}
      {pendingRequests.length === 0 ? (
        <EmptyState message="대기 중인 수업·가용시간 변경 요청이 없습니다. 승인 시 캘린더와 가용시간에 반영됩니다(충돌 재검사)." />
      ) : (
        <TableWrap minWidth={720}>
        <table className="table">
          <thead><tr><th>요청자/대상</th><th>일시/범위</th><th>요청</th><th>상세</th><th className="text-right"></th></tr></thead>
          <tbody>
            {pendingRequests.map((r) => {
              const isApproving = approvingRequestId === r.id;
              return (
                <tr key={r.id} className="cursor-pointer hover:bg-canvas-subtle" onClick={() => setDetailReq(r)} title="클릭 — 요청 상세(변경 내용·영향 수업·이력)">
                  <td className="font-medium">{instructorName(r.instructorId ?? r.availabilityOwnerId ?? r.requesterId)}</td>
                  <td className="mono text-fg-muted">{requestWhen(r)}</td>
                  <td className="text-fg-muted">{requestTitle(r)}</td>
                  <td className="text-fg-muted">{r.requestKind === 'session_create' || !r.requestKind ? (r.studentIds?.length ? `${r.studentIds.length}명(지정)` : '코스 전원') : requestDetail(r)}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn btn-sm btn-primary mr-1.5" disabled={approveRequest.isPending} aria-busy={isApproving} onClick={(e) => { e.stopPropagation(); onApproveRequest(r); }}>
                      {isApproving ? '처리 중' : '승인'}
                    </button>
                    <button className="btn btn-sm btn-danger" disabled={approveRequest.isPending} onClick={(e) => { e.stopPropagation(); setRequestReject(r.id); }}>반려</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </TableWrap>
      )}
      {requestReject != null && (
        <ReasonModal
          mode="input"
          title="수업·가용시간 요청 반려 — 사유 필수"
          onClose={() => setRequestReject(null)}
          onSubmit={(reason) => { rejectRequest.mutate({ id: requestReject, reason }); setRequestReject(null); }}
        />
      )}
      {forceApprove != null && (
        <ConfirmModal
          title="시간 충돌 — 강제 승인"
          message="요청 시간이 기존 일정과 충돌합니다. 무시하고 강제 승인할까요? 승인 시 충돌 상태로 세션이 생성됩니다."
          confirmLabel="강제 승인"
          danger
          onClose={() => { setForceApprove(null); setRequestMsg('승인 보류 — 충돌을 확인하세요.'); }}
          onConfirm={() => {
            const id = forceApprove;
            setForceApprove(null);
            approveRequest.mutate({ id, force: true }, { onSuccess: () => setRequestMsg('강제 승인 — 세션 생성됨(충돌 무시).') });
          }}
        />
      )}
      {/* [C2C-b] 행 클릭 상세 — 승인/반려는 리스트 버튼과 동일 핸들러 재사용(force 분기·사유 모달 포함) */}
      {detailReq && (
        <RequestDetailModal
          request={detailReq}
          instructorName={instructorName}
          courseName={(id) => (id != null ? courses.find((x) => x.id === id)?.name ?? '—' : '—')}
          onClose={() => setDetailReq(null)}
          onApprove={(r) => { setDetailReq(null); onApproveRequest(r); }}
          onReject={(r) => { setDetailReq(null); setRequestReject(r.id); }}
        />
      )}
    </SectionCard>
  );

  // [TBO-21] 승인 센터 = 관리자(매니저 이상). 지출·페이·가입 승인 액션은 대표(super_admin) 전용.
  if (!canManageApprovals) {
    return (
      <div className="p-6 max-w-page mx-auto space-y-6">
        <AdminHeader />
        <div className="card card-pad text-section text-fg-muted">
          승인 센터는 <b>관리자</b> 전용입니다. 현재 역할: {roleLabel[roleForAccess]}
        </div>
      </div>
    );
  }

  // [DESIGN §8] 대기>0 섹션이 위로, 0건 섹션은 하단 축약 스트립 — 빈 카드가 화면을 점유하지 않게.
  // 가입 승인(MemberApprovals)은 자체 페칭 컴포넌트라 정렬 대상에서 제외하고 항상 최상단.
  const sections: { key: string; count: number; node: ReactNode; label: string }[] = [
    { key: 'requests', count: pendingRequests.length, node: requestsSection, label: '수업·가용시간 요청' },
    {
      key: 'reports', count: pendingReports.length, label: '수업 보고서',
      node: (
        <SectionCard title={`수업 보고서 승인 대기 (${pendingReports.length})`}>
          <TableWrap minWidth={720}>
          <table className="table">
            <thead><tr><th>강사</th><th>학생</th><th>수업</th><th>내용</th><th className="text-right"></th></tr></thead>
            <tbody>
              {pendingReports.map((r) => (
                <tr key={r.id} data-testid={`approval-report-row-${r.id}`} className="cursor-pointer hover:bg-canvas-subtle" onClick={() => setDetailItem({ kind: 'report', row: r })} title="클릭 — 보고서 상세">
                  <td className="font-medium">{instructorName(r.instructorId)}</td>
                  <td>{studentName(r.studentId)}</td>
                  <td className="text-fg-muted">{sessionInfo(r.sessionId)}</td>
                  <td className="text-fg-muted max-w-[280px] truncate" title={r.content}>{r.content || '—'}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn btn-sm btn-primary mr-1.5" onClick={(e) => { e.stopPropagation(); approveReport.mutate({ id: r.id }); }}>승인</button>
                    <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); setReportReject(r.id); }}>반려</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableWrap>
        </SectionCard>
      ),
    },
    ...(isSuper ? [{
      key: 'expenses', count: pendingExpenses.length, label: '지출',
      node: (
        <SectionCard title={`지출 승인 대기 (${pendingExpenses.length})`}>
          <TableWrap minWidth={640}>
          <table className="table">
            <thead><tr><th>항목</th><th>분류</th><th className="text-right">금액</th><th>지출일</th><th></th></tr></thead>
            <tbody>
              {pendingExpenses.map((e) => (
                <tr key={e.id} data-testid={`approval-expense-row-${e.id}`} className="cursor-pointer hover:bg-canvas-subtle" onClick={() => setDetailItem({ kind: 'expense', row: e })} title="클릭 — 지출 상세">
                  <td className="font-medium">{e.title}</td>
                  <td className="text-fg-muted">{categoryLabel[e.category]}</td>
                  <td className="text-right mono">{won(e.amount)}</td>
                  <td className="mono text-fg-muted">{e.spentAt}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn btn-sm btn-primary mr-1.5" onClick={(ev) => { ev.stopPropagation(); approveExpense.mutate(e.id); }}>승인</button>
                    <button className="btn btn-sm btn-danger" onClick={(ev) => { ev.stopPropagation(); setExpenseReject(e.id); }}>반려</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableWrap>
        </SectionCard>
      ),
    }] : []),
    ...(isSuper ? [{
      key: 'payouts', count: pendingPayouts.length, label: '강사 페이',
      node: (
        <SectionCard title={`강사 페이 승인 대기 (${pendingPayouts.length})`}>
          <TableWrap minWidth={560}>
          <table className="table">
            <thead><tr><th>강사</th><th>기간</th><th className="text-right">금액</th><th></th></tr></thead>
            <tbody>
              {pendingPayouts.map((p) => (
                <tr key={p.id} data-testid={`approval-payout-row-${p.id}`} className="cursor-pointer hover:bg-canvas-subtle" onClick={() => setDetailItem({ kind: 'payout', row: p })} title="클릭 — 페이 상세">
                  <td className="font-medium">{instructorName(p.instructorId)}</td>
                  <td className="mono text-fg-muted">{p.periodStart} ~ {p.periodEnd}</td>
                  <td className="text-right mono">{won(p.amount)} <span className="text-fg-subtle">({p.sessionCount ?? 0}회)</span></td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn btn-sm btn-primary mr-1.5" onClick={(e) => { e.stopPropagation(); confirmPayout.mutate(p.id); }}>승인</button>
                    <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); setPayoutReject(p.id); }}>반려</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableWrap>
        </SectionCard>
      ),
    }] : []),
  ];
  // 수업 요청 섹션은 반려/강제승인 모달 상태를 포함하므로 0건이어도 모달이 열려 있으면 유지
  const activeSections = sections.filter((s) => s.count > 0 || (s.key === 'requests' && (requestReject != null || forceApprove != null || requestMsg != null)));
  const idleSections = sections.filter((s) => !activeSections.includes(s));

  return (
    <div className="p-6 max-w-page mx-auto space-y-6">
      <AdminHeader />

      {/* 가입 승인 = 대표 전용(BE SuperAdminGuard). 매니저는 보고서·수업요청만 처리. */}
      {isSuper && <MemberApprovals />}

      {activeSections.map((s) => <div key={s.key}>{s.node}</div>)}

      {idleSections.length > 0 && (
        <div className="card px-4 py-2.5 flex items-center gap-x-4 gap-y-1 flex-wrap text-caption text-fg-subtle">
          <span className="font-medium text-fg-muted shrink-0">대기 없음</span>
          {idleSections.map((s) => <span key={s.key}>✓ {s.label}</span>)}
        </div>
      )}

      <p className="text-caption text-fg-subtle">수업·가용시간 변경 요청과 보고서는 매니저 이상이 처리하고, 지출·강사 페이·가입 승인은 대표만 처리합니다.</p>

      {detailItem && (
        <ApprovalItemDetailModal
          item={detailItem}
          instructorName={instructorName}
          studentName={studentName}
          sessionInfo={sessionInfo}
          onClose={() => setDetailItem(null)}
          onApprove={approveDetailItem}
          onReject={rejectDetailItem}
        />
      )}

      {reportReject != null && (
        <ReasonModal
          mode="input"
          title="수업 보고서 반려 — 사유 필수"
          onClose={() => setReportReject(null)}
          onSubmit={(reason) => { rejectReport.mutate({ id: reportReject, reason }); setReportReject(null); }}
        />
      )}
      {expenseReject != null && (
        <ReasonModal
          mode="input"
          title="지출 반려"
          onClose={() => setExpenseReject(null)}
          onSubmit={(reason) => { rejectExpense.mutate({ id: expenseReject, reason }); setExpenseReject(null); }}
        />
      )}
      {payoutReject != null && (
        <ReasonModal
          mode="input"
          title="강사 페이 반려 — 사유 필수"
          onClose={() => setPayoutReject(null)}
          onSubmit={(reason) => { rejectPayout.mutate({ id: payoutReject, reason }); setPayoutReject(null); }}
        />
      )}
    </div>
  );
}
