// ─────────────────────────────────────────────────────────────────────────────
// [임시/실험용 — 나중에 제거] dev 역할 전환용 데모 계정 매핑.
//  탑네비 역할 토글이 이 계정으로 **실제 로그인**해 JWT를 교체 → 백엔드 RBAC까지 그 역할로 바뀐다.
//  이 계정들은 backend `UsersService.onModuleInit` 시드와 1:1(공통 비번 'demo1234').
//  student/parent는 백오피스 로그인 주체가 아니므로 이 매핑과 로그인 화면에 노출하지 않는다.
//  실험 종료 후 이 파일 + Topbar의 switchRole 분기 제거하면 됨.
// ─────────────────────────────────────────────────────────────────────────────
import type { AccountRole } from '@/types';

export const DEV_ROLE_ACCOUNTS: Partial<Record<AccountRole, { webId: string; password: string }>> = {
  super_admin: { webId: 'admin', password: 'demo1234' }, // 대표 · 김민수
  admin: { webId: 'prof_admin', password: 'demo1234' }, // 관리자 · 한서윤
  manager: { webId: 'manager', password: 'demo1234' }, // 매니저 · 이지원
  instructor: { webId: 'park_inst', password: 'demo1234' }, // 강사 · 박지훈
};
