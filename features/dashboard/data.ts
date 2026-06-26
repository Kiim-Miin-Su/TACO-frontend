import type { EnrollmentStatus } from '@/types';
import type { Tone } from '@/components/ui';

// 데모용 화면 데이터 (실제로는 lib/api로 교체).
export type EnrollmentRow = {
  id: number;
  student: string;
  english: string;
  course: string;
  status: EnrollmentStatus;
  amount: number;
  at: string;
};

export type TxnRow = {
  id: number;
  dir: 'in' | 'out';
  label: string;
  method: string;
  amount: number;
  at: string;
};

export const enrollments: EnrollmentRow[] = [
  { id: 1, student: '김서연', english: 'Sophia', course: 'SAT Reading 정규', status: 'active', amount: 480000, at: '2026-06-24' },
  { id: 2, student: '이준호', english: 'Daniel', course: 'AP Calculus BC', status: 'active', amount: 520000, at: '2026-06-23' },
  { id: 3, student: '박지민', english: 'Emma', course: 'IELTS Intensive', status: 'paused', amount: 360000, at: '2026-06-21' },
  { id: 4, student: '최민준', english: 'Lucas', course: 'TOEFL 정규', status: 'active', amount: 420000, at: '2026-06-20' },
];

export const txns: TxnRow[] = [
  { id: 1, dir: 'in', label: '신규 수강 입금 · 김서연', method: 'card', amount: 480000, at: '2026-06-24' },
  { id: 2, dir: 'out', label: '강사 페이 · 6월 1차 정산', method: 'transfer', amount: 1850000, at: '2026-06-24' },
  { id: 3, dir: 'in', label: '재수강 입금 · 이준호', method: 'transfer', amount: 520000, at: '2026-06-23' },
  { id: 4, dir: 'out', label: '비품 구입 · 화이트보드 외', method: 'cash', amount: 86000, at: '2026-06-22' },
];

export const statusTone: Record<EnrollmentStatus, Tone> = {
  active: 'success',
  paused: 'attention',
  completed: 'done',
  canceled: 'danger',
};

export const statusLabel: Record<EnrollmentStatus, string> = {
  active: '수강중',
  paused: '일시정지',
  completed: '수료',
  canceled: '취소',
};
