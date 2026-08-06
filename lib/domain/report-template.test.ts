import { describe, expect, it } from 'vitest';
import { canAutoApplyReportTemplate } from './report-template';

const blank = { content: '', progressPage: '', homework: '' };

describe('canAutoApplyReportTemplate', () => {
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
    ['authored content', { draft: { ...blank, content: '작성 중' } }],
    ['authored progress', { draft: { ...blank, progressPage: '12p' } }],
    ['authored homework', { draft: { ...blank, homework: '복습' } }],
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
