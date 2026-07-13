// [클라이언트 전용 상태] TanStack Query가 서버 데이터의 단일 소스가 된 후,
//  zustand는 서버와 무관한 클라이언트 상태만 보관한다.
//   - currentRole/currentAccount/currentStudentId: JWT에서 파생한 현재 사용자 표시 상태
//  [자산화 2차 2026-07-03] reportTemplates → DB(report_templates 컬렉션, useReportTemplates),
//  expenseRejectReasons → Expense.rejectedReason(서버 필드) — 브라우저 휘발분을 사내 자산으로 이관.
import { create } from 'zustand';
import type { AccountRole } from '@/types';

type TacoState = {
  // JWT에서 파생한 현재 사용자 표시 상태. 서버 권한의 진실원은 여전히 서명된 JWT다.
  currentRole: AccountRole;
  currentAccount: { id: number; name: string; role: AccountRole } | null;
  currentStudentId: number;
  setCurrentRole: (role: AccountRole) => void;
  setCurrentAccount: (account: TacoState['currentAccount']) => void;
  setCurrentStudentId: (id: number) => void;

};

export const useTacoStore = create<TacoState>((set) => ({
  currentRole: 'super_admin',
  currentAccount: null,
  currentStudentId: 1,
  setCurrentRole: (role) => set({ currentRole: role }),
  setCurrentAccount: (account) => set({ currentAccount: account }),
  setCurrentStudentId: (id) => set({ currentStudentId: id }),
}));
