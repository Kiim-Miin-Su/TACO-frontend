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
  useScheduleRequests,
  useApproveScheduleRequest,
  useRejectScheduleRequest,
} from '@/lib/queries';
import { won } from '@/lib/format';
import { isAdmin, roleLabel } from '@/lib/roles';
import { AdminHeader } from './AdminShell';
import { categoryLabel } from '@/features/expenses/labels';
import { api, type PendingAccount } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { ReasonModal } from '@/components/ReasonModal';
import type { AccountRole } from '@/types';

const ROLE_OPTS: AccountRole[] = ['instructor', 'manager', 'admin', 'super_admin'];

// 가입 승인 대기(백엔드 계정) — 이메일 인증 완료 후 대표가 승인하면 로그인 가능.
function MemberApprovals() {
  const [rows, setRows] = useState<PendingAccount[]>([]);
  const [roleSel, setRoleSel] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try { setRows(await api.auth.pending()); } catch { setMsg('목록을 불러오지 못했습니다. (대표 권한 필요)'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function decide(id: number, action: 'approve' | 'reject') {
    const token = getToken();
    if (!token) return;
    try {
      if (action === 'approve') await api.auth.approve(id, roleSel[id]);
      else await api.auth.reject(id);
      setMsg(action === 'approve' ? '승인했습니다.' : '반려했습니다.');
      await load();
    } catch { setMsg('처리 실패'); }
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
                  <button className="btn btn-sm btn-danger" onClick={() => decide(r.id, 'reject')}>반려</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </TableWrap>
      )}
    </SectionCard>
  );
}

// 승인은 대표(super_admin) 전용
export function ApprovalsView() {
  const currentRole = useTacoStore((s) => s.currentRole);
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
  const isSuper = currentRole === 'super_admin';
  const instructorName = (id: number) => instructors.find((i) => i.id === id)?.name ?? '—';

  const [expenseReject, setExpenseReject] = useState<number | null>(null);
  // ── 수업 요청(TBO-16 #9) — 배지(lib/tasks)와 같은 useScheduleRequests 모집단(단일 구독) ──
  const { data: scheduleRequests = [] } = useScheduleRequests();
  const approveRequest = useApproveScheduleRequest();
  const rejectRequest = useRejectScheduleRequest();
  const [requestReject, setRequestReject] = useState<number | null>(null);
  const [requestMsg, setRequestMsg] = useState<string | null>(null);
  // [DESIGN §5.5] 충돌 강제 승인 확인 — window.confirm 대신 ConfirmModal
  const [forceApprove, setForceApprove] = useState<number | null>(null);
  const pendingRequests = scheduleRequests.filter((r) => r.status === 'pending');
  // 승인 — 충돌 409면 force 재시도 확인(세션 생성과 동일 규약: 서버 createSession 재검사)
  const onApproveRequest = (id: number) => {
    approveRequest.mutate({ id }, {
      onSuccess: () => setRequestMsg('승인 — 캘린더에 세션이 생성되었습니다.'),
      onError: (e) => {
        const err = e as { response?: { status?: number } };
        if (err.response?.status === 409) setForceApprove(id);
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

  // 수업 요청 승인/반려는 BE가 manager 이상 허용(ADMIN_ROLES) — 섹션 컴포넌트로 분리해 재사용.
  const requestsSection = (
    <SectionCard title={`수업 요청 승인 대기 (${pendingRequests.length})`}>
      {requestMsg && <div className="px-4 pt-3 text-caption text-accent">{requestMsg}</div>}
      {pendingRequests.length === 0 ? (
        <EmptyState message="대기 중인 수업 요청이 없습니다. 승인 시 캘린더에 세션이 생성됩니다(충돌 재검사)." />
      ) : (
        <TableWrap minWidth={720}>
        <table className="table">
          <thead><tr><th>강사</th><th>일시</th><th>수업</th><th>인원</th><th className="text-right"></th></tr></thead>
          <tbody>
            {pendingRequests.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">{instructorName(r.instructorId)}</td>
                <td className="mono text-fg-muted">{r.sessionDate} {r.startTime}{r.endTime ? `~${r.endTime}` : ''}</td>
                <td className="text-fg-muted">{r.topic ?? courses.find((x) => x.id === r.courseId)?.name ?? '수업'}{r.kind && r.kind !== 'class' ? ` · ${r.kind === 'level_test' ? '진단고사' : '상담'}` : ''}</td>
                <td className="text-fg-muted">{r.studentIds?.length ? `${r.studentIds.length}명(지정)` : '코스 전원'}</td>
                <td className="text-right whitespace-nowrap">
                  <button className="btn btn-sm btn-primary mr-1.5" onClick={() => onApproveRequest(r.id)}>승인</button>
                  <button className="btn btn-sm btn-danger" onClick={() => setRequestReject(r.id)}>반려</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </TableWrap>
      )}
      {requestReject != null && (
        <ReasonModal
          mode="input"
          title="수업 요청 반려 — 사유 필수"
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
    </SectionCard>
  );

  if (!isSuper) {
    return (
      <div className="p-6 max-w-page mx-auto space-y-6">
        <AdminHeader />
        {isAdmin(currentRole) ? (
          <>
            {requestsSection}
            <div className="card card-pad text-body text-fg-muted">그 외 승인(가입·보고서·지출·페이)은 <b>대표(CEO)</b> 전용입니다. 현재 역할: {roleLabel[currentRole]}</div>
          </>
        ) : (
          <div className="card card-pad text-section text-fg-muted">
            🔒 승인 센터는 <b>관리자</b> 전용입니다. 현재 역할: {roleLabel[currentRole]} — 우측 상단에서 전환하세요.
          </div>
        )}
      </div>
    );
  }

  // [DESIGN §8] 대기>0 섹션이 위로, 0건 섹션은 하단 축약 스트립 — 빈 카드가 화면을 점유하지 않게.
  // 가입 승인(MemberApprovals)은 자체 페칭 컴포넌트라 정렬 대상에서 제외하고 항상 최상단.
  const sections: { key: string; count: number; node: ReactNode; label: string }[] = [
    { key: 'requests', count: pendingRequests.length, node: requestsSection, label: '수업 요청' },
    {
      key: 'reports', count: pendingReports.length, label: '수업 보고서',
      node: (
        <SectionCard title={`수업 보고서 승인 대기 (${pendingReports.length})`}>
          <TableWrap minWidth={720}>
          <table className="table">
            <thead><tr><th>강사</th><th>학생</th><th>수업</th><th>내용</th><th className="text-right"></th></tr></thead>
            <tbody>
              {pendingReports.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{instructorName(r.instructorId)}</td>
                  <td>{studentName(r.studentId)}</td>
                  <td className="text-fg-muted">{sessionInfo(r.sessionId)}</td>
                  <td className="text-fg-muted max-w-[280px] truncate" title={r.content}>{r.content || '—'}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn btn-sm btn-primary mr-1.5" onClick={() => approveReport.mutate({ id: r.id })}>승인</button>
                    <button className="btn btn-sm btn-danger" onClick={() => rejectReport.mutate({ id: r.id })}>반려</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableWrap>
        </SectionCard>
      ),
    },
    {
      key: 'expenses', count: pendingExpenses.length, label: '지출',
      node: (
        <SectionCard title={`지출 승인 대기 (${pendingExpenses.length})`}>
          <TableWrap minWidth={640}>
          <table className="table">
            <thead><tr><th>항목</th><th>분류</th><th className="text-right">금액</th><th>지출일</th><th></th></tr></thead>
            <tbody>
              {pendingExpenses.map((e) => (
                <tr key={e.id}>
                  <td className="font-medium">{e.title}</td>
                  <td className="text-fg-muted">{categoryLabel[e.category]}</td>
                  <td className="text-right mono">{won(e.amount)}</td>
                  <td className="mono text-fg-muted">{e.spentAt}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn btn-sm btn-primary mr-1.5" onClick={() => approveExpense.mutate(e.id)}>승인</button>
                    <button className="btn btn-sm btn-danger" onClick={() => setExpenseReject(e.id)}>반려</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableWrap>
        </SectionCard>
      ),
    },
    {
      key: 'payouts', count: pendingPayouts.length, label: '강사 페이',
      node: (
        <SectionCard title={`강사 페이 승인 대기 (${pendingPayouts.length})`}>
          <TableWrap minWidth={560}>
          <table className="table">
            <thead><tr><th>강사</th><th>기간</th><th className="text-right">금액</th><th></th></tr></thead>
            <tbody>
              {pendingPayouts.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{instructorName(p.instructorId)}</td>
                  <td className="mono text-fg-muted">{p.periodStart} ~ {p.periodEnd}</td>
                  <td className="text-right mono">{won(p.amount)} <span className="text-fg-subtle">({p.sessionCount ?? 0}회)</span></td>
                  <td className="text-right">
                    <button className="btn btn-sm btn-primary" onClick={() => confirmPayout.mutate(p.id)}>승인</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableWrap>
        </SectionCard>
      ),
    },
  ];
  // 수업 요청 섹션은 반려/강제승인 모달 상태를 포함하므로 0건이어도 모달이 열려 있으면 유지
  const activeSections = sections.filter((s) => s.count > 0 || (s.key === 'requests' && (requestReject != null || forceApprove != null || requestMsg != null)));
  const idleSections = sections.filter((s) => !activeSections.includes(s));

  return (
    <div className="p-6 max-w-page mx-auto space-y-6">
      <AdminHeader />

      <MemberApprovals />

      {activeSections.map((s) => <div key={s.key}>{s.node}</div>)}

      {idleSections.length > 0 && (
        <div className="card px-4 py-2.5 flex items-center gap-x-4 gap-y-1 flex-wrap text-caption text-fg-subtle">
          <span className="font-medium text-fg-muted shrink-0">대기 없음</span>
          {idleSections.map((s) => <span key={s.key}>✓ {s.label}</span>)}
        </div>
      )}

      <p className="text-caption text-fg-subtle">승인 시 지출은 즉시 출금 반영, 강사 페이는 승인 후 강사페이 탭에서 지급 처리합니다.</p>

      {expenseReject != null && (
        <ReasonModal
          mode="input"
          title="지출 반려"
          onClose={() => setExpenseReject(null)}
          onSubmit={(reason) => { rejectExpense.mutate({ id: expenseReject, reason }); setExpenseReject(null); }}
        />
      )}
    </div>
  );
}
