import type { ExpenseCategory, ApprovalStatus } from '@/types';
import type { Tone } from '@/components/ui';

export const approvalLabel: Record<ApprovalStatus, string> = { requested: '승인대기', approved: '승인됨', rejected: '반려' };
export const approvalTone: Record<ApprovalStatus, Tone> = { requested: 'attention', approved: 'success', rejected: 'danger' };

export const categoryLabel: Record<ExpenseCategory, string> = {
  supplies: '비품', equipment: '기자재', books: '교재', rent: '임대료',
  utility: '공과금', marketing: '마케팅', meal: '식비/다과', etc: '기타',
};
export const categoryTone: Record<ExpenseCategory, Tone> = {
  supplies: 'neutral', equipment: 'accent', books: 'done', rent: 'attention',
  utility: 'attention', marketing: 'success', meal: 'neutral', etc: 'neutral',
};
export const CATEGORIES: ExpenseCategory[] = [
  'supplies', 'equipment', 'books', 'rent', 'utility', 'marketing', 'meal', 'etc',
];
