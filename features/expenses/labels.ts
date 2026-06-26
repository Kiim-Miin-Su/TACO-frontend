import type { ExpenseCategory } from '@/types';
import type { Tone } from '@/components/ui';

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
