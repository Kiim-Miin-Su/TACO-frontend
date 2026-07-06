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
  // [임시/실험용 — 나중에 제거] dev 역할 오버라이드 (UI 전용 미리보기)
  //  탑네비 역할 토글의 **두 경로 중 UI 전용 경로**에서만 쓴다:
  //   · staff 3역할(대표/매니저/강사) = Topbar.switchRole이 데모 계정으로 **실제 재로그인**해
  //     JWT를 교체 → 백엔드 RBAC까지 그 역할로 바뀐다(override 미사용, devRoleOverride=false).
  //   · 로그인 계정이 없는 역할(학생/학부모 — 엔티티만 존재) = **overrideRole**로 currentRole만 바꿔
  //     화면을 미리본다(토큰 불변 → 백엔드는 여전히 실제 로그인 계정 권한).
  //  devRoleOverride=true이면 AppShell이 라우팅마다 하던 "JWT→currentRole 재하이드레이션"을 건너뛴다
  //   (안 그러면 페이지 이동 시 실제 역할로 되돌아감). '복귀'(clearRoleOverride)로 실제 역할 복원.
  devRoleOverride: boolean;
  overrideRole: (role: AccountRole) => void; // UI 전용 미리보기 켜기(+currentRole 설정)
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
