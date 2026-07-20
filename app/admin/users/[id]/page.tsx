// [유저 관리 2026-07-20] 유저 상세 — 비밀번호 재확인(sudo) 게이트 → 조회·수정·삭제(B7 단건 규약).
import { UserDetailView } from '@/features/admin/UserDetailView';

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UserDetailView userId={Number(id)} />;
}
