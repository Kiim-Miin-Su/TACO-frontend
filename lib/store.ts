// [클라이언트 전용 상태] TanStack Query가 서버 데이터의 단일 소스가 된 후,
//  zustand는 서버와 무관한 클라이언트 상태만 보관한다.
//   - currentAccount: `/auth/me`에서 검증된 현재 사용자 표시 상태(권한/query scope의 유일 입력)
//  [75B 2026-07-28] 레거시 제거 — currentRole(쓰기만 있고 읽기 0)·currentStudentId(demo 잔재,
//  기본값 1·소비처 0)를 물리 삭제. auth.md §4 "Zustand role·demo ID를 업무 query 조건으로
//  직접 사용 금지" 규약의 잔재 표면을 없애 새 코드가 실수로 읽을 경로 자체를 제거한다.
//  [자산화 2차 2026-07-03] reportTemplates → DB(report_templates 컬렉션, useReportTemplates),
//  expenseRejectReasons → Expense.rejectedReason(서버 필드) — 브라우저 휘발분을 사내 자산으로 이관.
import { create } from 'zustand';
import type { AccountRole } from '@/types';

type TacoState = {
  currentAccount: { id: number; name: string; role: AccountRole; mustChangePassword: boolean } | null;
  setCurrentAccount: (account: TacoState['currentAccount']) => void;
};

export const useTacoStore = create<TacoState>((set) => ({
  currentAccount: null,
  setCurrentAccount: (account) => set({ currentAccount: account }),
}));
