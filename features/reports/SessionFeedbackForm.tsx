// [TBO-20 20-0] 공용 세션 피드백(보고서) 작성 폼 — (session,student) 1건 단일.
//  단일 소스: 읽기=useReports/useReportTemplates, 쓰기=useCreateReport/useSubmitReport(백엔드가 session×student 단일화).
//  기존 ReportWriteView의 StudentReportRow·FeedbackFormView의 폼이 이원화 → 하나로 통합.
//  재사용처: ReportWriteView(인라인 목록)·FeedbackFormView(전용 페이지)·세션 상세 허브(20-3).
'use client';
import { useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '@/lib/api-error';
import { reportApprovalBadge } from '@/lib/domain/reports'; // [P2 FE-4]
import { Badge, ModalShell, type Tone } from '@/components/ui';
import { useReports, useReportTemplates, useEffectiveReportTemplate, useRemoveReportTemplate, useCreateReport, useSubmitReport, useUpdateReport } from '@/lib/queries';
import type { ClassSession, ReportStatus, Student } from '@/types';
import type { ReportTemplate } from '@kms545487/contracts';
import { useAccountAccess } from '@/lib/useAccountAccess';
import { ReportBundleCopyButton } from './ReportBundleCopyButton';
import { ReportContentTextarea } from './ReportContentTextarea';
import { ReportTemplateEditorModal } from './ReportTemplateEditorModal';
import { canAutoApplyReportTemplate, composeReportText, DEFAULT_REPORT_SCAFFOLD } from '@/lib/domain/report-template';

const reportTone: Record<ReportStatus, Tone> = { draft: 'neutral', submitted: 'accent', sent: 'success' };
const reportLabel: Record<ReportStatus, string> = { draft: '작성중', submitted: '작성완료', sent: '발송됨' };

/**
 * 세션×학생 피드백 작성 셀. 페이지 이동 없이 저장/제출.
 * @param canEdit 권한 가드(강사 본인/매니저). false면 읽기 전용(20-1 정합).
 */
export function SessionFeedbackForm({ session, student, canEdit = true }: { session: ClassSession; student: Student; canEdit?: boolean }) {
  const reportsQuery = useReports();
  const sessionReports = reportsQuery.data ?? [];
  // 템플릿은 DB 컬렉션(report_templates) — 강사 공용 자산(브라우저 휘발 제거).
  const { data: templates = [] } = useReportTemplates();
  const { data: effectiveTemplate, isSuccess: effectiveResolved } = useEffectiveReportTemplate(session.instructorId);
  const effectiveResolvedEmpty = effectiveResolved && !effectiveTemplate; // 서버 기본 템플릿 없음 확정 → 내장 양식
  const createReport = useCreateReport();
  const updateReport = useUpdateReport();
  const submitReport = useSubmitReport();
  const report = sessionReports.find((r) => r.sessionId === session.id && r.studentId === student.id);
  // [TBO-89] 단일 텍스트 박스 — 레거시 진도/숙제 필드는 로드 시 본문으로 합성(compose)해 보여주고,
  //  이 폼이 저장하면 본문이 단일 표현이 된다(별도 input 제거 — owner 지시).
  const [content, setContent] = useState(report ? composeReportText(report) : '');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const status: ReportStatus = report?.status ?? 'draft';
  const saving = createReport.isPending || updateReport.isPending || submitReport.isPending;
  // 승인 후 불변(시수 반영) — 서버 400과 동일 규칙으로 편집 잠금.
  const lockedByApproval = report?.approvalStatus === 'approved';
  const enrichedSession = session as ClassSession & { courseName?: string; subjectName?: string };
  const context = report?.context;
  const autoAppliedTemplateId = useRef<number | null>(null);
  const userEdited = useRef(false);

  useEffect(() => {
    autoAppliedTemplateId.current = null;
    userEdited.current = false;
  }, [session.id, student.id]);

  // 서버 목록이 늦게 도착하거나 다른 화면에서 수정된 뒤 무효화되면 DB 값을 폼에 다시 투영한다.
  useEffect(() => {
    if (!report) return;
    userEdited.current = false;
    setContent(composeReportText(report));
  }, [report]);

  // 서버 effective 우선순위를 한 번만 적용한다. DB/로컬 본문이나 사용자가 입력한 값을 덮지 않는다.
  //  [TBO-89] 템플릿의 진도/숙제 필드도 본문 안에 합성(scaffold — 빈 항목은 기본 양식 라인).
  //  서버 기본 템플릿이 없으면(effective null 확정) 내장 기본 양식을 제공한다.
  useEffect(() => {
    const eligible = canAutoApplyReportTemplate({
      reportsPending: reportsQuery.isPending,
      reportExists: !!report,
      templateId: effectiveTemplate ? effectiveTemplate.id : effectiveResolvedEmpty ? -1 : null,
      appliedTemplateId: autoAppliedTemplateId.current,
      userEdited: userEdited.current,
      draft: { content },
    });
    if (!eligible) return;
    autoAppliedTemplateId.current = effectiveTemplate ? effectiveTemplate.id : -1;
    setContent(effectiveTemplate ? composeReportText(effectiveTemplate, { scaffold: true }) : DEFAULT_REPORT_SCAFFOLD);
  }, [content, effectiveTemplate, effectiveResolvedEmpty, report, reportsQuery.isPending]);

  const applyTemplate = (id: number) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    userEdited.current = true;
    const merged = composeReportText(t, { scaffold: true });
    setContent((c) => (c.trim() ? c + '\n' + merged : merged));
  };
  const [templateOpen, setTemplateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false); // [TBO-58 P2] 템플릿 삭제 모달

  // [E0.6 H1 2026-07-15] 저장 신뢰성 수정 — 종전엔 (1) 기존 보고서 '임시 저장'이 저장 경로 자체가
  //  없었고 (2) '제출'이 편집한 본문을 보내지 않았고 (3) 결과와 무관하게 "저장됨"이 표시됐다.
  //  → 기존 보고서는 PATCH(update)로 본문/숙제를 저장하고, 제출은 저장 후 상태 전환.
  //  savedAt은 성공 콜백에서만, 실패는 saveError로 표시.
  const markSaved = () => {
    setSaveError(null);
    setSavedAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
  };
  // [75A] lib/api-error 단일 진실원 위임(로컬 파싱 재구현 제거)
  const failMessage = (caught: unknown): string => apiErrorMessage(caught, '저장하지 못했습니다. 다시 시도해 주세요.');
  const save = async (submit: boolean) => {
    setSaveError(null);
    try {
      if (report) {
        // 편집 내용 저장(승인 전) → 제출이면 상태 전환까지. 어느 단계든 실패 시 에러 표시.
        // [TBO-89] 본문이 단일 표현 — 레거시 진도/숙제 컬럼은 ''로 비움(BE가 null 정규화,
        //  로드 시 본문에 이미 합성됐으므로 이중 표현·복사 중복을 막는다).
        await updateReport.mutateAsync({ id: report.id, content, progressPage: '', homework: '' });
        if (submit && report.approvalStatus !== 'submitted' && report.approvalStatus !== 'approved') {
          await submitReport.mutateAsync(report.id);
        }
      } else {
        if (session.instructorId == null) {
          setSaveError('담당 강사를 배정한 뒤 리포트를 작성할 수 있습니다.');
          return;
        }
        await createReport.mutateAsync({
          sessionId: session.id,
          studentId: student.id,
          instructorId: session.instructorId,
          content,
          status: submit ? 'submitted' : 'draft',
        });
      }
      markSaved();
    } catch (caught) {
      setSaveError(failMessage(caught));
    }
  };

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="font-medium">{student.name}</span>
        {student.englishName && <span className="text-caption text-fg-subtle">{student.englishName}</span>}
        <Badge tone={reportTone[status]}>{reportLabel[status]}</Badge>
        {report?.approvalStatus === 'approved' && <Badge tone={reportApprovalBadge('approved').tone}>{reportApprovalBadge('approved').label}</Badge>}
        {report?.approvalStatus === 'rejected' && <Badge tone="danger">반려</Badge>}
        <span className="flex w-full items-center justify-end gap-2 sm:ml-auto sm:w-auto">
          {savedAt && <span className="text-micro text-fg-subtle">저장됨 {savedAt}</span>}
          {report && <ReportBundleCopyButton report={report} />}
        </span>
      </div>
      {report?.approvalStatus === 'rejected' && report.rejectedReason && (
        <div className="mb-2 text-caption text-danger">반려 사유: {report.rejectedReason}</div>
      )}
      <div className="mb-3 grid gap-1 bg-bg-subtle px-3 py-2 text-caption sm:grid-cols-2">
        <span>학년/학생: {context?.student.grade != null ? `G${context.student.grade} · ` : ''}{context?.student.name ?? student.name}</span>
        <span>수업일자: {context?.session.sessionDate ?? session.sessionDate}</span>
        <span>과목: {context?.subject?.name ?? context?.course.name ?? enrichedSession.subjectName ?? enrichedSession.courseName ?? `수업 #${session.courseId}`}</span>
        <span>수업 시간: {context?.session.startTime ?? session.startTime ?? '-'} - {context?.session.endTime ?? session.endTime ?? '-'}</span>
      </div>
      {!canEdit ? (
        // 읽기 전용(권한 없음) — 저장된 내용만 표시.
        <div className="space-y-1.5 text-body">
          <p className="whitespace-pre-wrap">{report?.content ? report.content : <span className="text-fg-subtle">작성된 피드백 없음</span>}</p>
          {report?.progressPage && <p className="text-caption text-fg-muted">진도 페이지: {report.progressPage}</p>}
          {report?.homework && <p className="text-caption text-fg-muted">숙제: {report.homework}</p>}
        </div>
      ) : (
        <>
          {/* 템플릿 적용/저장/관리 — [TBO-58 P2] 삭제 UI(BE DELETE 기구현, 훅·버튼만 부재였던 갭)
              [TBO-89] 좁은 패널(캘린더 상세)에서 버튼이 잘리던 결함 → flex-wrap + select 축소 허용. */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <select className="input h-8 w-44 min-w-0 shrink text-caption" value="" onChange={(e) => e.target.value && applyTemplate(Number(e.target.value))}>
              <option value="">템플릿 적용…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button type="button" className="btn btn-sm whitespace-nowrap" onClick={() => setTemplateOpen(true)} disabled={!content.trim()}>현재 내용을 템플릿으로</button>
            {templates.length > 0 && (
              <button type="button" className="btn btn-sm whitespace-nowrap" onClick={() => setManageOpen(true)}>템플릿 관리</button>
            )}
          </div>
          {/* [TBO-89b] 단일 텍스트 박스 — 템플릿 편집 모달과 같은 공용 컴포넌트(ReportContentTextarea). */}
          <ReportContentTextarea
            value={content}
            disabled={lockedByApproval}
            onChange={(value) => { userEdited.current = true; setContent(value); }}
          />
          {saveError && <p className="mt-2 text-caption text-danger" role="alert">{saveError}</p>}
          {lockedByApproval && <p className="mt-2 text-caption text-fg-subtle">승인된 보고서는 수정할 수 없습니다(시수 반영됨).</p>}
          <div className="flex justify-end gap-2 mt-2">
            <button className="btn btn-sm" disabled={saving || lockedByApproval} onClick={() => save(false)}>
              {saving ? '저장 중...' : '임시 저장'}
            </button>
            <button className="btn btn-sm btn-primary" disabled={!content.trim() || saving || lockedByApproval} onClick={() => save(true)}>제출</button>
          </div>
          {templateOpen && (
            <ReportTemplateEditorModal
              initial={{ content }}
              onClose={() => setTemplateOpen(false)}
              onSaved={() => setTemplateOpen(false)}
            />
          )}
          {manageOpen && <TemplateManageModal onClose={() => setManageOpen(false)} />}
        </>
      )}
    </div>
  );
}

// 강사는 본인 personal, manager+는 모든 scope를 관리한다. 서버 owner 검증이 최종 권위다.
function TemplateManageModal({ onClose }: { onClose: () => void }) {
  const access = useAccountAccess();
  const { data: templates = [] } = useReportTemplates();
  const removeTemplate = useRemoveReportTemplate();
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [editing, setEditing] = useState<ReportTemplate | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const canMutate = (template: ReportTemplate) =>
    access.can('approval.manage') || template.ownerUserId === access.account?.id;
  if (editing) {
    // [TBO-89b] 레거시 분리 필드 합성은 모달 내부(composeReportText)가 담당 — initial 불필요.
    return (
      <ReportTemplateEditorModal
        template={editing}
        onClose={() => setEditing(null)}
        onSaved={() => setEditing(null)}
      />
    );
  }
  return (
    <ModalShell title="리포트 템플릿 관리" onClose={onClose}>
      <div className="p-2 max-h-80 overflow-y-auto">
        {templates.length === 0 ? (
          <p className="p-3 text-body text-fg-subtle">템플릿이 없습니다.</p>
        ) : templates.map((t) => (
          <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 border-b border-line-muted last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="text-body font-medium truncate">{t.name}</div>
              <div className="text-caption text-fg-subtle truncate">{t.content}</div>
              <div className="text-micro text-fg-subtle">
                {t.ownerUserId == null ? '전체 강사 적용' : '개인'}
                {t.isDefault ? ' · 기본' : ''}
              </div>
            </div>
            {!canMutate(t) ? (
              <span className="text-micro text-fg-subtle">공용</span>
            ) : confirmId === t.id ? (
              <>
                <button type="button" className="btn btn-sm btn-danger" disabled={removeTemplate.isPending}
                  onClick={() => {
                    setMutationError(null);
                    removeTemplate.mutate(t.id, {
                      onSuccess: () => setConfirmId(null),
                      onError: (error) => setMutationError(apiErrorMessage(error, '템플릿을 삭제하지 못했습니다.')),
                    });
                  }}>
                  정말 삭제
                </button>
                <button type="button" className="btn btn-sm" onClick={() => setConfirmId(null)}>취소</button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-sm" onClick={() => setEditing(t)}>수정</button>
                <button type="button" className="btn btn-sm text-danger" onClick={() => setConfirmId(t.id)}>삭제</button>
              </>
            )}
          </div>
        ))}
      </div>
      {mutationError && <p className="px-4 pb-2 text-caption text-danger" role="alert">{mutationError}</p>}
      <p className="px-4 pb-3 text-caption text-fg-subtle">이미 작성된 리포트 내용은 템플릿 변경의 영향을 받지 않습니다.</p>
    </ModalShell>
  );
}
