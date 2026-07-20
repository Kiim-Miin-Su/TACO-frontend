'use client';
// [B6 C3 2026-07-16] 승인 행 클릭 진입 — 수기 <tr onClick> 제거, ClickableTableRow(onActivate)로 통일(키보드 접근 포함).
import { useState, type ReactNode } from 'react';
import { ClickableTableRow, ConfirmModal, EmptyState, SectionCard, TableWrap } from '@/components/ui';
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
  useProfileChangeRequests,
  useUsers,
  usePendingAccounts,
  useResendPendingVerification,
  useDeletePendingAccount,
  useApprovePendingAccount,
  useRejectPendingAccount,
} from '@/lib/queries';
import { dateOnly, won } from '@/lib/format';
import { roleLabel } from '@/lib/roles';
import { AdminHeader } from './AdminShell';
import { categoryLabel } from '@/features/expenses/labels';
import { expenseApprovalRows } from '@/lib/approvals'; // [핫픽스 07-20 ②] 승인센터·배지·대시보드 공용 술어
import { type ScheduleRequestEx } from '@/lib/api';
import { AVAILABILITY_KIND_LABEL, RECURRENCE_SCOPE_LABEL, WEEKDAY_LABEL } from '@/lib/domain/approvals';
import { ReasonModal } from '@/components/ReasonModal';
import { RequestDetailModal } from './RequestDetailModal';
import { ApprovalItemDetailModal, type ApprovalDetailItem } from './ApprovalItemDetailModal';
import type { AccountRole } from '@/types';
import { ProfileChangeRequestsSection } from './ProfileChangeRequestsSection';
import { useAccountAccess } from '@/lib/useAccountAccess';

// [대표 지시 2026-07-16] super_admin 단일 계정 불변식 — 승인 role 옵션에서 제외(BE도 400로 차단).
const ROLE_OPTS: AccountRole[] = ['instructor', 'manager', 'admin'];

// 가입 승인 대기(백엔드 계정) — 이메일 인증 완료 후 대표가 승인하면 로그인 가능.
function MemberApprovals() {
  const { data: rows = [], isError } = usePendingAccounts();
  const approveAccount = useApprovePendingAccount();
  const rejectAccount = useRejectPendingAccount();
  const resendVerification = useResendPendingVerification(); // [핫픽스 07-20 ①] 레거시 미인증 구제
  const deleteAccount = useDeletePendingAccount(); // [핫픽스 07-20] 오가입 정리(식별자 해제·재가입 허용)
  const [roleSel, setRoleSel] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [memberReject, setMemberReject] = useState<number | null>(null); // [TBO-28B] 반려 사유 필수 모달
  const [memberDelete, setMemberDelete] = useState<number | null>(null); // [핫픽스 07-20] 삭제 사유 필수 모달

  // [핫픽스 07-20] 실패 시 서버 메시지를 그대로 보여준다 — 종전 '처리 실패' 일반화가
  //  "왜 반려가 안 되지?"(대표 보고)의 원인 중 하나(원인 판별 불가).
  const serverMessage = (error: unknown, fallback: string): string => {
    const ax = error as { response?: { status?: number; data?: { message?: string | string[] } } };
    if (ax.response?.status === 409) return '이미 처리된 계정입니다(목록을 새로고침했습니다).';
    const m = ax.response?.data?.message;
    return (Array.isArray(m) ? m.join(' ') : m) ?? fallback;
  };

  function decide(id: number, action: 'approve' | 'reject', reason?: string) {
    const mutation = action === 'approve' ? approveAccount : rejectAccount;
    const variables = action === 'approve' ? { id, role: roleSel[id] } : { id, reason: reason ?? '' };
    mutation.mutate(variables as never, {
      onSuccess: () => setMsg(action === 'approve' ? '승인했습니다.' : '반려했습니다.'),
      onError: (error) => setMsg(serverMessage(error, '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.')),
    });
  }

  function resend(id: number) {
    resendVerification.mutate(id, {
      onSuccess: (res) => setMsg(res.devVerifyLink ? `인증 메일을 다시 보냈습니다. (개발 링크: ${res.devVerifyLink})` : '인증 메일을 다시 보냈습니다. 지원자가 메일의 링크를 누르면 승인할 수 있습니다.'),
      onError: (error) => setMsg(serverMessage(error, '인증 메일을 보내지 못했습니다.')),
    });
  }

  return (
    <SectionCard title={`가입 승인 대기 (${rows.length})`}>
      {(msg || isError) && <div className="px-4 pt-3 text-caption text-accent">{msg ?? '목록을 불러오지 못했습니다. (대표 권한 필요)'}</div>}
      {rows.length === 0 ? (
        <EmptyState message="승인 대기 중인 가입 신청이 없습니다." />
      ) : (
        <TableWrap minWidth={980}>
        <table className="table">
          {/* [E0.5 ④b] 지원자 제공 정보(전화·대학/전공·출생연도) — 승인 판단 근거 표시 */}
          <thead><tr><th>아이디</th><th>이름</th><th>이메일</th><th>연락처</th><th>대학 (전공)</th><th>출생연도</th><th>이메일 인증</th><th>역할 지정</th><th className="text-right"></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">{r.webId}</td>
                <td>{r.name}</td>
                <td className="text-fg-muted">{r.email}</td>
                <td className="mono text-fg-muted whitespace-nowrap">{r.phone || "—"}</td>
                <td className="text-fg-muted">{r.university ? `${r.university}${r.major ? ` (${r.major})` : ""}` : "—"}</td>
                <td className="mono text-fg-muted">{r.birthYear ?? "—"}</td>
                <td>{r.emailVerified ? <span className="text-success">완료</span> : <span className="text-fg-subtle">미완료</span>}</td>
                <td>
                  <select className="input h-8 w-28" value={roleSel[r.id] ?? r.role}
                    onChange={(e) => setRoleSel((s) => ({ ...s, [r.id]: e.target.value }))}>
                    {ROLE_OPTS.map((ro) => <option key={ro} value={ro}>{roleLabel[ro]}</option>)}
                  </select>
                </td>
                <td className="text-right whitespace-nowrap">
                  {/* [핫픽스 07-20 ①] 미인증 = 인증 메일 재발송으로 구제(레거시 가입자 — 메일 미수신) */}
                  {!r.emailVerified && (
                    <button className="btn btn-sm mr-1.5" disabled={resendVerification.isPending} onClick={() => resend(r.id)}>
                      인증 메일 재발송
                    </button>
                  )}
                  <button className="btn btn-sm btn-primary mr-1.5" disabled={!r.emailVerified} onClick={() => decide(r.id, 'approve')} title={r.emailVerified ? '' : '이메일 인증 후 승인 가능 — 재발송으로 인증을 유도하세요'}>승인</button>
                  <button className="btn btn-sm btn-danger mr-1.5" onClick={() => setMemberReject(r.id)}>반려</button>
                  {/* [핫픽스 07-20] 삭제 — 식별자 해제(같은 아이디·이메일 재가입 허용)+개인정보 파기 */}
                  <button className="btn btn-sm" onClick={() => setMemberDelete(r.id)}>삭제</button>
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
      {memberDelete != null && (
        <ReasonModal
          mode="input"
          title="가입 신청 삭제 — 사유 필수 (같은 아이디·이메일로 재가입 가능해집니다)"
          submitLabel="삭제"
          placeholder="삭제 사유를 입력하세요 (감사 이력에 남습니다)"
          onClose={() => setMemberDelete(null)}
          onSubmit={(reason) => {
            deleteAccount.mutate({ id: memberDelete, reason }, {
              onSuccess: () => setMsg('가입 신청을 삭제했습니다. 같은 아이디·이메일로 다시 가입할 수 있습니다.'),
              onError: (error) => setMsg(serverMessage(error, '삭제하지 못했습니다.')),
            });
            setMemberDelete(null);
          }}
        />
      )}
    </SectionCard>
  );
}

// 승인 센터 = 관리자(매니저 이상). 단 가입 승인은 대표(super_admin) 전용.
export function ApprovalsView() {
  const { role: verifiedRole, can } = useAccountAccess();
  const roleForAccess: AccountRole = verifiedRole ?? 'instructor';
  const canManageApprovals = can('approval.manage');
  const { data: instructors = [] } = useInstructors();
  const { data: expenses = [] } = useExpenses();
  const { data: instructorPayouts = [] } = usePayouts();
  const { data: sessionReports = [] } = useReports();
  const { data: students = [] } = useStudents();
  const { data: classSessions = [] } = useSchedule();
  const { data: courses = [] } = useCourses();
  const { data: profileChangeRequests = [] } = useProfileChangeRequests();
  const { data: users = [] } = useUsers();
  const approveReport = useApproveReport();
  const rejectReport = useRejectReport();
  const approveExpense = useApproveExpense();
  const rejectExpense = useRejectExpense();
  const confirmPayout = useConfirmPayout();
  const rejectPayout = useRejectPayout();
  const isSuper = can('signup.decide');
  const instructorName = (id?: number) => id != null ? instructors.find((i) => i.id === id)?.name ?? '—' : '—';

  const [reportReject, setReportReject] = useState<number | null>(null);
  const [expenseReject, setExpenseReject] = useState<number | null>(null);
  const [payoutReject, setPayoutReject] = useState<number | null>(null);
  const [detailItem, setDetailItem] = useState<ApprovalDetailItem | null>(null);
  // [E0.6 M 2026-07-16] 보고서·지출·페이 승인/반려 — 성공/실패 피드백 통일(가입 승인 msg 패턴 재사용).
  //  종전엔 mutate가 조용히 끝나 실패(권한·409 이중 처리)가 화면에 드러나지 않았다.
  const [sectionMsg, setSectionMsg] = useState<Partial<Record<'reports' | 'expenses' | 'payouts', string>>>({});
  const feedback = (key: 'reports' | 'expenses' | 'payouts', okMsg: string) => ({
    onSuccess: () => setSectionMsg((m) => ({ ...m, [key]: okMsg })),
    onError: (error: unknown) => {
      const status = (error as { response?: { status?: number } }).response?.status;
      setSectionMsg((m) => ({
        ...m,
        [key]: status === 409 ? '이미 처리된 건입니다(목록이 갱신되었습니다).'
          : status === 403 ? '처리 권한이 없습니다(대표 전용).'
            : '처리에 실패했습니다. 다시 시도해 주세요.',
      }));
    },
  });
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
  const pendingProfileRequests = profileChangeRequests.filter((r) => r.status === 'pending');
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
  const pendingExpenses = expenseApprovalRows(expenses); // [핫픽스 07-20 ②] 단일 소스(lib/approvals) — 배지·대시보드와 같은 함수
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
    if (item.kind === 'report') approveReport.mutate({ id: item.row.id }, feedback('reports', '보고서를 승인했습니다 — 시수 정산 대상에 반영됩니다.'));
    else if (item.kind === 'expense') approveExpense.mutate(item.row.id, feedback('expenses', '지출을 승인했습니다.'));
    else confirmPayout.mutate(item.row.id, feedback('payouts', '페이 지급을 확정했습니다.'));
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
                <ClickableTableRow
                  key={r.id}
                  onActivate={() => setDetailReq(r)}
                  label={`${instructorName(r.instructorId ?? r.availabilityOwnerId ?? r.requesterId)} — ${requestTitle(r)} 요청 상세`}
                  className="hover:bg-canvas-subtle"
                  title="클릭 — 요청 상세(변경 내용·영향 수업·이력)"
                >
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
                </ClickableTableRow>
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
    {
      key: 'profile-requests',
      count: pendingProfileRequests.length,
      node: <ProfileChangeRequestsSection requests={pendingProfileRequests} users={users} />,
      label: '프로필 변경 요청',
    },
    { key: 'requests', count: pendingRequests.length, node: requestsSection, label: '수업·가용시간 요청' },
    {
      key: 'reports', count: pendingReports.length, label: '수업 보고서',
      node: (
        <SectionCard title={`수업 보고서 승인 대기 (${pendingReports.length})`}>
          {sectionMsg.reports && <div className="px-4 pt-3 text-caption text-accent" role="status">{sectionMsg.reports}</div>}
          <TableWrap minWidth={720}>
          <table className="table">
            <thead><tr><th>강사</th><th>학생</th><th>수업</th><th>내용</th><th className="text-right"></th></tr></thead>
            <tbody>
              {pendingReports.map((r) => (
                <ClickableTableRow
                  key={r.id}
                  testId={`approval-report-row-${r.id}`}
                  onActivate={() => setDetailItem({ kind: 'report', row: r })}
                  label={`${instructorName(r.instructorId)} — ${studentName(r.studentId)} 보고서 상세`}
                  className="hover:bg-canvas-subtle"
                  title="클릭 — 보고서 상세"
                >
                  <td className="font-medium">{instructorName(r.instructorId)}</td>
                  <td>{studentName(r.studentId)}</td>
                  <td className="text-fg-muted">{sessionInfo(r.sessionId)}</td>
                  <td className="text-fg-muted max-w-[280px] truncate" title={r.content}>{r.content || '—'}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn btn-sm btn-primary mr-1.5" disabled={approveReport.isPending} onClick={(e) => { e.stopPropagation(); approveReport.mutate({ id: r.id }, feedback('reports', '보고서를 승인했습니다 — 시수 정산 대상에 반영됩니다.')); }}>승인</button>
                    <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); setReportReject(r.id); }}>반려</button>
                  </td>
                </ClickableTableRow>
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
          {sectionMsg.expenses && <div className="px-4 pt-3 text-caption text-accent" role="status">{sectionMsg.expenses}</div>}
          <TableWrap minWidth={640}>
          <table className="table">
            <thead><tr><th>항목</th><th>분류</th><th className="text-right">금액</th><th>지출일</th><th></th></tr></thead>
            <tbody>
              {pendingExpenses.map((e) => (
                <ClickableTableRow
                  key={e.id}
                  testId={`approval-expense-row-${e.id}`}
                  onActivate={() => setDetailItem({ kind: 'expense', row: e })}
                  label={`${e.title} 지출 상세`}
                  className="hover:bg-canvas-subtle"
                  title="클릭 — 지출 상세"
                >
                  <td className="font-medium">{e.title}</td>
                  <td className="text-fg-muted">{categoryLabel[e.category]}</td>
                  <td className="text-right mono">{won(e.amount)}</td>
                  <td className="mono text-fg-muted">{dateOnly(e.spentAt)}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn btn-sm btn-primary mr-1.5" disabled={approveExpense.isPending} onClick={(ev) => { ev.stopPropagation(); approveExpense.mutate(e.id, feedback('expenses', '지출을 승인했습니다.')); }}>승인</button>
                    <button className="btn btn-sm btn-danger" onClick={(ev) => { ev.stopPropagation(); setExpenseReject(e.id); }}>반려</button>
                  </td>
                </ClickableTableRow>
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
          {sectionMsg.payouts && <div className="px-4 pt-3 text-caption text-accent" role="status">{sectionMsg.payouts}</div>}
          <TableWrap minWidth={560}>
          <table className="table">
            <thead><tr><th>강사</th><th>기간</th><th className="text-right">금액</th><th></th></tr></thead>
            <tbody>
              {pendingPayouts.map((p) => (
                <ClickableTableRow
                  key={p.id}
                  testId={`approval-payout-row-${p.id}`}
                  onActivate={() => setDetailItem({ kind: 'payout', row: p })}
                  label={`${instructorName(p.instructorId)} 페이 상세`}
                  className="hover:bg-canvas-subtle"
                  title="클릭 — 페이 상세"
                >
                  <td className="font-medium">{instructorName(p.instructorId)}</td>
                  <td className="mono text-fg-muted">{p.periodStart} ~ {p.periodEnd}</td>
                  <td className="text-right mono">{won(p.amount)} <span className="text-fg-subtle">({p.sessionCount ?? 0}회)</span></td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn btn-sm btn-primary mr-1.5" disabled={confirmPayout.isPending} onClick={(e) => { e.stopPropagation(); confirmPayout.mutate(p.id, feedback('payouts', '페이 지급을 확정했습니다.')); }}>승인</button>
                    <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); setPayoutReject(p.id); }}>반려</button>
                  </td>
                </ClickableTableRow>
              ))}
            </tbody>
          </table>
          </TableWrap>
        </SectionCard>
      ),
    }] : []),
  ];
  // 수업 요청 섹션은 반려/강제승인 모달 상태를 포함하므로 0건이어도 모달이 열려 있으면 유지.
  // [E0.6 M] 보고서·지출·페이도 마지막 건 처리 직후 피드백 메시지가 보이도록 msg 있는 동안 유지.
  const activeSections = sections.filter((s) =>
    s.count > 0
    || (s.key === 'requests' && (requestReject != null || forceApprove != null || requestMsg != null))
    || sectionMsg[s.key as 'reports' | 'expenses' | 'payouts'] != null,
  );
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

      <p className="text-caption text-fg-subtle">프로필·수업·가용시간 변경 요청과 보고서는 매니저 이상이 처리하고, 지출·강사 페이·가입 승인은 대표만 처리합니다.</p>

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
          onSubmit={(reason) => { rejectReport.mutate({ id: reportReject, reason }, feedback('reports', '보고서를 반려했습니다.')); setReportReject(null); }}
        />
      )}
      {expenseReject != null && (
        <ReasonModal
          mode="input"
          title="지출 반려"
          onClose={() => setExpenseReject(null)}
          onSubmit={(reason) => { rejectExpense.mutate({ id: expenseReject, reason }, feedback('expenses', '지출을 반려했습니다.')); setExpenseReject(null); }}
        />
      )}
      {payoutReject != null && (
        <ReasonModal
          mode="input"
          title="강사 페이 반려 — 사유 필수"
          onClose={() => setPayoutReject(null)}
          onSubmit={(reason) => { rejectPayout.mutate({ id: payoutReject, reason }, feedback('payouts', '페이를 반려했습니다.')); setPayoutReject(null); }}
        />
      )}
    </div>
  );
}
