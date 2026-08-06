export type ReportTemplateDraft = {
  content: string;
  progressPage: string;
  homework: string;
};

export function canAutoApplyReportTemplate(input: {
  reportsPending: boolean;
  reportExists: boolean;
  templateId?: number | null;
  appliedTemplateId?: number | null;
  userEdited: boolean;
  draft: ReportTemplateDraft;
}): boolean {
  if (input.reportsPending || input.reportExists || input.userEdited || input.templateId == null) return false;
  if (input.appliedTemplateId === input.templateId) return false;
  return !input.draft.content.trim()
    && !input.draft.progressPage.trim()
    && !input.draft.homework.trim();
}
