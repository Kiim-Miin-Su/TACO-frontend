export type FormIssue<Field extends string = string> = {
  field: Field;
  code: string;
  message: string;
};

/** 화면 순서의 issue 배열을 빨간 필드 표시와 첫 focus의 단일 소스로 사용한다. */
export function issuesByField<Field extends string>(issues: readonly FormIssue<Field>[]): ReadonlyMap<Field, FormIssue<Field>> {
  const result = new Map<Field, FormIssue<Field>>();
  for (const issue of issues) if (!result.has(issue.field)) result.set(issue.field, issue);
  return result;
}

export function firstFormIssue<Field extends string>(issues: readonly FormIssue<Field>[]): FormIssue<Field> | undefined {
  return issues[0];
}

/**
 * 제출 실패 렌더 다음 frame에 첫 오류 필드로 이동한다.
 * data-field는 도메인 validator의 field key와 같은 값을 쓰므로 selector 순서 사본이 없다.
 */
export function focusFirstFormIssue<Field extends string>(
  root: HTMLElement | null,
  issues: readonly FormIssue<Field>[],
): void {
  const issue = firstFormIssue(issues);
  if (!root || !issue || typeof window === 'undefined') return;
  window.requestAnimationFrame(() => {
    const field = [...root.querySelectorAll<HTMLElement>('[data-field]')]
      .find((element) => element.dataset.field === issue.field);
    const target = field?.matches('input, select, textarea, button, [tabindex]')
      ? field
      : field?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?? field?.querySelector<HTMLElement>('input:not([type="checkbox"]):not([disabled]), select:not([disabled]), textarea:not([disabled])')
        ?? field?.querySelector<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])');
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}
