import { describe, expect, it } from 'vitest';
import { canAutoApplyReportTemplate, composeReportText, DEFAULT_REPORT_SCAFFOLD } from './report-template';

const blank = { content: '' };

describe('canAutoApplyReportTemplate — 단일 본문 초안(TBO-89)', () => {
  it('applies a server-selected template once to a blank unsaved report', () => {
    expect(canAutoApplyReportTemplate({
      reportsPending: false,
      reportExists: false,
      templateId: 3,
      appliedTemplateId: null,
      userEdited: false,
      draft: blank,
    })).toBe(true);
    expect(canAutoApplyReportTemplate({
      reportsPending: false,
      reportExists: false,
      templateId: 3,
      appliedTemplateId: 3,
      userEdited: false,
      draft: blank,
    })).toBe(false);
  });

  it.each([
    ['loaded report', { reportExists: true }],
    ['pending report list', { reportsPending: true }],
    ['user-edited draft', { userEdited: true }],
    ['authored content', { draft: { content: '작성 중' } }],
  ])('does not overwrite %s', (_label, override) => {
    expect(canAutoApplyReportTemplate({
      reportsPending: false,
      reportExists: false,
      templateId: 3,
      appliedTemplateId: null,
      userEdited: false,
      draft: blank,
      ...override,
    })).toBe(false);
  });
});

describe('composeReportText — 분리 필드를 단일 본문으로 합성(TBO-89)', () => {
  it('레거시 리포트: 내용 + 진도/숙제 값을 라벨 라인으로 합성한다', () => {
    expect(composeReportText({ content: '오늘 리딩 3세트', progressPage: '12~15p', homework: '워크북 16p' }))
      .toBe('오늘 리딩 3세트\n진도: 12~15p\n숙제: 워크북 16p');
  });

  it('scaffold 옵션: 비어 있는 진도·숙제도 기본 양식 라인으로 채운다(본문 꼬리 공백은 정리)', () => {
    expect(composeReportText({ content: '오늘 학습 내용: ' }, { scaffold: true }))
      .toBe('오늘 학습 내용:\n진도: p. \n숙제: 교재 p. ~ 풀이');
  });

  it('본문에 이미 같은 라벨 라인이 있으면 중복 추가하지 않는다(재편집 멱등)', () => {
    const merged = '오늘 리딩 3세트\n진도: 12~15p\n숙제: 워크북 16p';
    expect(composeReportText({ content: merged, progressPage: '12~15p', homework: '워크북 16p' })).toBe(merged);
    expect(composeReportText({ content: merged }, { scaffold: true })).toBe(merged);
  });

  it('빈 입력 + scaffold = 진도·숙제 라인만, 기본 양식 상수는 5개 라인 전체를 제공한다', () => {
    expect(composeReportText({}, { scaffold: true })).toBe('진도: p. \n숙제: 교재 p. ~ 풀이');
    expect(DEFAULT_REPORT_SCAFFOLD.split('\n')).toHaveLength(5);
    expect(DEFAULT_REPORT_SCAFFOLD).toContain('진도: p.');
    expect(DEFAULT_REPORT_SCAFFOLD).toContain('숙제: 교재 p. ~ 풀이');
  });
});
