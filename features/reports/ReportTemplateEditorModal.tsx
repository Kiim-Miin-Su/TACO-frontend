'use client';

import { useState } from 'react';
import type { CreateReportTemplateInput, ReportTemplate } from '@kms545487/contracts';
import { ModalShell } from '@/components/ui';
import { apiErrorMessage } from '@/lib/api-error';
import {
  useCreateReportTemplate,
  useInstructors,
  useUpdateReportTemplate,
} from '@/lib/queries';
import { useAccountAccess } from '@/lib/useAccountAccess';

export type ReportTemplateDraft = {
  content: string;
  progressPage?: string;
  homework?: string;
};

export function ReportTemplateEditorModal({
  initial,
  template,
  onClose,
  onSaved,
}: {
  initial: ReportTemplateDraft;
  template?: ReportTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const access = useAccountAccess();
  const canManageScopes = access.can('approval.manage');
  const { data: instructors = [] } = useInstructors();
  const createTemplate = useCreateReportTemplate();
  const updateTemplate = useUpdateReportTemplate();
  const [name, setName] = useState(template?.name ?? '');
  const [content, setContent] = useState(template?.content ?? initial.content);
  const [progressPage, setProgressPage] = useState(template?.progressPage ?? initial.progressPage ?? '');
  const [homework, setHomework] = useState(template?.homework ?? initial.homework ?? '');
  const [ownerValue, setOwnerValue] = useState(
    template?.ownerUserId == null ? 'global' : String(template.ownerUserId),
  );
  const [isDefault, setIsDefault] = useState(template?.isDefault ?? false);
  const [isEnforced, setIsEnforced] = useState(template?.isEnforced ?? false);
  const [error, setError] = useState<string | null>(null);
  const pending = createTemplate.isPending || updateTemplate.isPending;
  const invalid = !name.trim() || !content.trim();

  const save = async () => {
    if (invalid || pending) return;
    setError(null);
    const ownerUserId = canManageScopes
      ? ownerValue === 'global' ? null : Number(ownerValue)
      : undefined;
    const input: CreateReportTemplateInput = {
      name: name.trim(),
      content: content.trim(),
      progressPage: progressPage.trim() || undefined,
      homework: homework.trim() || undefined,
      ownerUserId,
      isDefault,
      isEnforced: canManageScopes && ownerUserId == null ? isEnforced : false,
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
        <span className="mb-1 block text-caption font-medium text-fg-muted">수업 내용 *</span>
        <textarea className="input min-h-28 py-2" value={content} maxLength={2000} onChange={(event) => setContent(event.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-caption font-medium text-fg-muted">진도 페이지</span>
        <input className="input" value={progressPage} maxLength={1000} onChange={(event) => setProgressPage(event.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-caption font-medium text-fg-muted">숙제</span>
        <textarea className="input min-h-20 py-2" value={homework} maxLength={1000} onChange={(event) => setHomework(event.target.value)} />
      </label>
      {canManageScopes ? (
        <label className="block">
          <span className="mb-1 block text-caption font-medium text-fg-muted">적용 범위</span>
          <select
            className="input"
            value={ownerValue}
            onChange={(event) => {
              setOwnerValue(event.target.value);
              if (event.target.value !== 'global') setIsEnforced(false);
            }}
          >
            <option value="global">전체 강사</option>
            {instructors.map((instructor) => (
              <option key={instructor.id} value={instructor.id}>{instructor.name}</option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-caption text-fg-muted">적용 범위: 개인</p>
      )}
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <label className="flex items-center gap-2 text-caption">
          <input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />
          기본 템플릿
        </label>
        {canManageScopes && ownerValue === 'global' && (
          <label className="flex items-center gap-2 text-caption">
            <input type="checkbox" checked={isEnforced} onChange={(event) => setIsEnforced(event.target.checked)} />
            전체 강제 적용
          </label>
        )}
      </div>
      {error && <p className="text-caption text-danger" role="alert">{error}</p>}
    </ModalShell>
  );
}
