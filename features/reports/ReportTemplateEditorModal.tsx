'use client';
// [TBO-89b owner 지시 2026-08-07] 템플릿 편집도 **단일 텍스트 박스**(작성 폼과 같은
//  ReportContentTextarea 재사용 — 내용·진도·숙제를 한 본문으로, 레거시 분리 필드는 열 때 합성).
//  적용 범위도 통합: 종전 [적용 범위 select + 전체 강제 체크]가 사실상 같은 기능이라
//  **"전체 강사에게 적용" 체크 하나**로 — 체크 = 전역 저장(전 강사 템플릿 리스트 노출) + 강제
//  적용(effective 최우선). 해제 = 개인 템플릿(서버 규칙: 활성 강사 원부 필요 — 매니저 본인이
//  강사가 아니면 서버 400이 인라인 표면화된다). 강사는 항상 개인(서버가 본인으로 강제).
import { useState } from 'react';
import type { CreateReportTemplateInput, ReportTemplate } from '@kms545487/contracts';
import { ModalShell } from '@/components/ui';
import { apiErrorMessage } from '@/lib/api-error';
import { useCreateReportTemplate, useUpdateReportTemplate } from '@/lib/queries';
import { useAccountAccess } from '@/lib/useAccountAccess';
import { composeReportText } from '@/lib/domain/report-template';
import { ReportContentTextarea } from './ReportContentTextarea';

export type ReportTemplateDraft = {
  content: string;
};

export function ReportTemplateEditorModal({
  initial,
  template,
  onClose,
  onSaved,
}: {
  initial?: ReportTemplateDraft;
  template?: ReportTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const access = useAccountAccess();
  const canManageScopes = access.can('approval.manage');
  const createTemplate = useCreateReportTemplate();
  const updateTemplate = useUpdateReportTemplate();
  const [name, setName] = useState(template?.name ?? '');
  // 레거시 템플릿(분리 진도/숙제)은 열 때 본문으로 합성 — 저장하면 본문이 단일 표현이 된다.
  const [content, setContent] = useState(template ? composeReportText(template) : initial?.content ?? '');
  // 전체 강사 적용(전역+강제) 단일 레버 — 관리자 기본값은 신규=전체, 수정=현재 scope 유지.
  const [applyAll, setApplyAll] = useState(template ? template.ownerUserId == null : canManageScopes);
  const [isDefault, setIsDefault] = useState(template?.isDefault ?? false);
  const [error, setError] = useState<string | null>(null);
  const pending = createTemplate.isPending || updateTemplate.isPending;
  const invalid = !name.trim() || !content.trim();

  const save = async () => {
    if (invalid || pending) return;
    setError(null);
    // progressPage/homework는 보내지 않는다 — 본문이 단일 표현(update는 미전송 필드를 비움).
    const input: CreateReportTemplateInput = {
      name: name.trim(),
      content: content.trim(),
      ownerUserId: canManageScopes ? (applyAll ? null : access.account?.id) : undefined,
      isDefault,
      isEnforced: canManageScopes && applyAll,
    };
    try {
      if (template) await updateTemplate.mutateAsync({ id: template.id, input });
      else await createTemplate.mutateAsync(input);
      onSaved();
    } catch (caught) {
      setError(apiErrorMessage(caught, '템플릿을 저장하지 못했습니다.'));
    }
  };

  return (
    <ModalShell
      title={template ? '리포트 템플릿 수정' : '리포트 템플릿 저장'}
      onClose={onClose}
      bodyClassName="space-y-3"
      footer={(
        <>
          <button type="button" className="btn btn-sm" onClick={onClose}>취소</button>
          <button type="button" className="btn btn-sm btn-primary" disabled={invalid || pending} onClick={save}>
            {pending ? '저장 중...' : '저장'}
          </button>
        </>
      )}
    >
      <label className="block">
        <span className="mb-1 block text-caption font-medium text-fg-muted">템플릿 이름 *</span>
        <input className="input" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-caption font-medium text-fg-muted">템플릿 내용 * — 내용·진도·숙제를 한 본문으로</span>
        <ReportContentTextarea value={content} onChange={setContent} maxLength={2000} className="input min-h-40 py-2 leading-relaxed" />
      </label>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {canManageScopes ? (
          <label className="flex items-center gap-2 text-caption">
            <input type="checkbox" checked={applyAll} onChange={(event) => setApplyAll(event.target.checked)} />
            전체 강사에게 적용 (전 강사 템플릿 리스트에 저장)
          </label>
        ) : (
          <p className="text-caption text-fg-muted">적용 범위: 개인</p>
        )}
        <label className="flex items-center gap-2 text-caption">
          <input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />
          기본 템플릿
        </label>
      </div>
      {error && <p className="text-caption text-danger" role="alert">{error}</p>}
    </ModalShell>
  );
}
