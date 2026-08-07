// [TBO-89 owner 지시 2026-08-07] 리포트 작성은 **단일 텍스트 박스**다 — 내용·진도·숙제를
//  별도 input 3개로 받지 않고, 한 본문 안에 기본 양식(스캐폴드) 라인으로 제공한다.
//  기존 데이터(report/template의 progressPage·homework 컬럼)는 읽을 때 본문으로 합성(compose)하고,
//  이 폼이 저장하면 본문이 단일 표현이 된다(레거시 필드는 ''로 비움 — BE가 null 정규화).

export type ReportTemplateDraft = {
  content: string;
};

/** 단일 텍스트 박스의 기본 양식 — 서버 기본 템플릿이 없을 때의 폴백(내용·이해도·특이사항·진도·숙제). */
export const DEFAULT_REPORT_SCAFFOLD = [
  '오늘 학습 내용: ',
  '이해도: 상/중/하',
  '특이사항: ',
  '진도: p. ',
  '숙제: 교재 p. ~ 풀이',
].join('\n');

/** 분리 저장된 리포트/템플릿(내용·진도·숙제)을 단일 본문으로 합성한다.
 *  scaffold=true면 비어 있는 진도·숙제도 기본 양식 라인으로 채운다(새 작성용).
 *  이미 본문에 같은 라벨 라인이 있으면 중복 추가하지 않는다(레거시 재편집 멱등). */
export function composeReportText(
  parts: { content?: string | null; progressPage?: string | null; homework?: string | null },
  options: { scaffold?: boolean } = {},
): string {
  const content = (parts.content ?? '').replace(/\s+$/, '');
  const lines: string[] = content ? [content] : [];
  const hasLabelLine = (label: string) => new RegExp(`(^|\\n)\\s*${label}\\s*:`).test(content);
  const progress = parts.progressPage?.trim();
  if (progress) { if (!hasLabelLine('진도')) lines.push(`진도: ${progress}`); }
  else if (options.scaffold && !hasLabelLine('진도')) lines.push('진도: p. ');
  const homework = parts.homework?.trim();
  if (homework) { if (!hasLabelLine('숙제')) lines.push(`숙제: ${homework}`); }
  else if (options.scaffold && !hasLabelLine('숙제')) lines.push('숙제: 교재 p. ~ 풀이');
  return lines.join('\n');
}

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
  return !input.draft.content.trim();
}
