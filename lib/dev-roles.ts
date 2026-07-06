// ─────────────────────────────────────────────────────────────────────────────
// [임시/실험용 — 나중에 제거] dev 역할 전환용 데모 계정 매핑.
//  탑네비 역할 토글이 이 계정으로 **실제 로그인**해 JWT를 교체 → 백엔드 RBAC까지 그 역할로 바뀐다.
//  이 3계정은 backend `UsersService.onModuleInit` 시드와 1:1(공통 비번 'demo1234').
//  student/parent는 로그인 계정이 없음(엔티티만 존재 — 자가 로그인 역할 제거됨) → 여기 없음.
//    → 토글에서 student/parent는 백엔드 세션 없이 **UI 전용 미리보기**(devRoleOverride)로만 전환.
//  실험 종료 후 이 파일 + Topbar의 switchRole 분기 제거하면 됨.
// ─────────────────────────────────────────────────────────────────────────────
import type { AccountRole } from '@/types';

export const DEV_ROLE_ACCOUNTS: Partial<Record<AccountRole, { webId: string; password: string }>> = {
  super_admin: { webId: 'admin', password: 'demo1234' }, // 대표 · 김민수
  manager: { webId: 'manager', password: 'demo1234' }, // 매니저 · 이지원
  instructor: { webId: 'park_inst', password: 'demo1234' }, // 강사 · 박지훈
};
