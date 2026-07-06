// [클라이언트 전용 상태] TanStack Query가 서버 데이터의 단일 소스가 된 후,
//  zustand는 서버와 무관한 클라이언트 상태만 보관한다.
//   - currentRole/currentStudentId: 데모용 현재 사용자(권한/본인 식별)
//  [자산화 2차 2026-07-03] reportTemplates → DB(report_templates 컬렉션, useReportTemplates),
//  expenseRejectReasons → Expense.rejectedReason(서버 필드) — 브라우저 휘발분을 사내 자산으로 이관.
import { create } from 'zustand';
import type { AccountRole } from '@/types';

type TacoState = {
  // 데모용 현재 사용자(권한/본인 식별)
  currentRole: AccountRole;
  currentStudentId: number;
  setCurrentRole: (role: AccountRole) => void;
  setCurrentStudentId: (id: number) => void;

  // ─────────────────────────────────────────────────────────────────────────
  // [임시/실험용 — 나중에 제거] dev 역할 오버라이드
  //  목적: 로그인 상태에서도 탑네비 토글로 강사/매니저 등 다른 역할의 화면을 즉시 실험.
  //  동작: devRoleOverride=true이면 AppShell이 라우팅마다 하던 "JWT→currentRole 재하이드레이션"을
  //        건너뛴다(그렇지 않으면 페이지 이동 시 실제 역할로 되돌아감) → 토글로 고른 역할이 유지된다.
  //  ⚠ 범위: 이건 **프론트 UI 게이팅(currentRole)만** 바꾼다. 백엔드 RBAC는 여전히 실제 로그인 JWT의
  //     roles로 인가한다. 데모 기본 계정(super_admin)으로 로그인한 상태면 낮은 역할로 내려도 쓰기가
  //     막히지 않는다(토큰이 상위라서). 특정 역할의 백엔드 403까지 재현하려면 그 역할 계정으로 로그인할 것.
  devRoleOverride: boolean;
  overrideRole: (role: AccountRole) => void; // 토글 선택 = 오버라이드 켜기(+currentRole 설정)
  clearRoleOverride: () => void; // 실제(JWT) 역할로 복귀 — AppShell이 다음 렌더에 재하이드레이션
  // ─────────────────────────────────────────────────────────────────────────
};

export const useTacoStore = create<TacoState>((set) => ({
  currentRole: 'super_admin',
  currentStudentId: 1,
  setCurrentRole: (role) => set({ currentRole: role }),
  setCurrentStudentId: (id) => set({ currentStudentId: id }),

  // [임시/실험용] 위 주석 참조.
  devRoleOverride: false,
  overrideRole: (role) => set({ currentRole: role, devRoleOverride: true }),
  clearRoleOverride: () => set({ devRoleOverride: false }),
}));
