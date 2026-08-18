import { describe, expect, it } from 'vitest';
import { firstFormIssue, issuesByField, type FormIssue } from './form-issues';

describe('form issue SSOT', () => {
  const issues: FormIssue<'course' | 'students'>[] = [
    { field: 'course', code: 'required', message: '과목을 선택해 주세요.' },
    { field: 'students', code: 'required', message: '학생을 선택해 주세요.' },
    { field: 'course', code: 'stale', message: '사라진 과목입니다.' },
  ];

  it('화면 순서의 첫 issue가 auto-focus SSOT다', () => {
    expect(firstFormIssue(issues)).toEqual(issues[0]);
  });

  it('한 필드에 여러 issue가 있어도 첫 메시지만 노출한다', () => {
    const byField = issuesByField(issues);
    expect(byField.get('course')).toEqual(issues[0]);
    expect(byField.get('students')).toEqual(issues[1]);
  });
});
