'use client';
// [TBO-58 P2 2026-07-24] 보고서 전용 상세(/reports/[id]) — 알림·승인센터·시수 화면에서 딥링크로
//  진입하는 단건 뷰(종전 인라인·모달만 있어 공유 가능한 URL이 없었다 — 검증① 갭).
//  단일 소스: 읽기=useReport(서버 단건 — 강사는 본인 것만 403), 학생·세션 표기는 기존 훅 재사용.
//  승인/반려 = 기존 중앙 훅(useApproveReport/useRejectReport — 시수 캐시 fan-out 동일).
import { useState } from 'react';
import { reportApprovalBadge } from '@/lib/domain/reports'; // [P2 FE-4]
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, ConfirmModal, DetailStates, SectionCard, type Tone } from '@/components/ui';
import { useReport, useApproveReport, useRejectReport, useRemoveReport } from '@/lib/queries';
import { AccountingImpactModal } from '@/components/AccountingImpactModal'; // [TBO-79 B5]
import { useAccountAccess } from '@/lib/useAccountAccess';
import { ReasonModal } from '@/components/ReasonModal';
import { shortDate } from '@/lib/format';
import { internalRoute } from '@/lib/navigation-security';
import { ReportBundleCopyButton } from './ReportBundleCopyButton';

// [P2 FE-4] 라벨 진실원 = lib/domain/reports(사본 제거)

export function ReportDetailView({ reportId }: { reportId: number }) {
  const access = useAccountAccess();
  const admin = access.can('approval.manage');
  const reportQuery = useReport(reportId);
  const router = useRouter();
  const approveReport = useApproveReport();
  const rejectReport = useRejectReport();
  const removeReport = useRemoveReport();
  const [rejecting, setRejecting] = useState(false);
  const [removing, setRemoving] = useState(false);

  return (
    <div className="p-6 max-w-[760px] mx-auto space-y-5">
      <DetailStates query={reportQuery} notFoundMessage={`보고서를 찾을 수 없습니다. (id: ${reportId})`} backHref="/reports">
        {(report) => {
          const { context } = report;
          const approval = reportApprovalBadge(report.approvalStatus);
          const canRemove = report.approvalStatus === 'draft'
            && (admin || access.instructorId === Number(report.instructorId));
          return (
            <>
              <div>
                <Link href="/reports" className="text-caption text-fg-muted hover:underline">← 보고서</Link>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <h1 className="text-title font-bold">{context.student.name} 수업 리포트</h1>
                  <Badge tone={approval.tone}>{approval.label}</Badge>
                </div>
                <p className="text-body text-fg-muted mt-0.5">
                  <Link href={internalRoute.session(context.session.id)} className="hover:underline">
                    {context.subject?.name ?? context.course.name} · {shortDate(context.session.sessionDate)}
                    {context.session.startTime ? ` ${context.session.startTime}` : ''}
                    {context.session.endTime ? `-${context.session.endTime}` : ''}
                  </Link>
                  {` · ${context.student.grade != null ? `G${context.student.grade} · ` : ''}강사 ${context.instructor.name}`}
                </p>
              </div>

              {report.approvalStatus === 'rejected' && report.rejectedReason && (
                <div className="p-3 rounded-lg border border-danger/40 text-body text-danger">반려 사유: {report.rejectedReason}</div>
              )}

              <SectionCard title="리포트 내용" action={<ReportBundleCopyButton report={report} />}>
                <div className="p-4 space-y-3 text-body">
                  <p className="whitespace-pre-wrap">{report.content || <span className="text-fg-subtle">내용 없음</span>}</p>
                  {report.progressPage && (
                    <p className="text-caption text-fg-muted border-t border-line-muted pt-3">진도 페이지: {report.progressPage}</p>
                  )}
                  {report.homework && (
                    <p className="text-caption text-fg-muted border-t border-line-muted pt-3">숙제: {report.homework}</p>
                  )}
                </div>
              </SectionCard>

              {/* 관리자 — 승인/반려(시수 적격 편입은 서버·캐시 fan-out이 처리). 편집은 세션 상세의 피드백 폼에서. */}
              {admin && report.approvalStatus === 'submitted' && (
                <div className="flex gap-2">
                  <button className="btn btn-primary" disabled={approveReport.isPending} onClick={() => approveReport.mutate({ id: report.id })}>승인 (시수 반영)</button>
                  <button className="btn btn-danger" disabled={rejectReport.isPending} onClick={() => setRejecting(true)}>반려</button>
                </div>
              )}
              {canRemove && (
                <button className="btn btn-danger" disabled={removeReport.isPending} onClick={() => setRemoving(true)}>
                  draft 철회
                </button>
              )}
              <p className="text-caption text-fg-subtle">
                수정은 <Link href={internalRoute.session(report.sessionId)} className="underline">세션 상세의 피드백 폼</Link>에서 —
                이 페이지와 같은 데이터(단일 소스)입니다.
              </p>

              {rejecting && (
                <ReasonModal
                  mode="input"
                  title="리포트 반려"
                  onClose={() => setRejecting(false)}
                  onSubmit={(reason) => { rejectReport.mutate({ id: report.id, reason }); setRejecting(false); }}
                />
              )}
              {/* [TBO-79 B5] 승인 리포트 반려 시 회계 영향 확인. */}
              <AccountingImpactModal
                prompt={rejectReport.accountingPrompt}
                onClose={rejectReport.dismissAccountingPrompt}
                onConfirm={rejectReport.confirmAccountingImpact}
              />
              {removing && (
                <ConfirmModal
                  title="draft 보고서 철회"
                  message="잘못 만든 임시 보고서를 철회할까요? 보고서 행은 soft-delete되고 감사 이력은 보존됩니다."
                  confirmLabel="철회"
                  danger
                  onClose={() => setRemoving(false)}
                  onConfirm={() => removeReport.mutate(report.id, {
                    onSuccess: () => router.replace('/reports'),
                    onSettled: () => setRemoving(false),
                  })}
                />
              )}
            </>
          );
        }}
      </DetailStates>
    </div>
  );
}
