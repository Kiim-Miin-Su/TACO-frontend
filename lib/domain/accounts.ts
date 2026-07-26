// [TBO-65 P2 FE-7 2026-07-26] 계정 상태 표기 단일 진실원 — UsersView·UserDetailView 사본 수렴
//  (session-shared·enrollments와 같은 규약: 라벨 맵 + 방어 헬퍼).
import type { Tone } from '@/components/ui';

export const ACCOUNT_STATUS_LABEL: Record<string, string> = {
  active: '활성', pending: '승인 대기', rejected: '반려됨', suspended: '정지',
};
export const ACCOUNT_STATUS_TONE: Record<string, Tone> = {
  active: 'success', pending: 'accent', rejected: 'danger', suspended: 'attention',
};
export const accountStatusLabel = (status: string): string => ACCOUNT_STATUS_LABEL[status] ?? status;
