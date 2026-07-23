// [TBO-32 C4 2026-07-22] 정산서 단건 상세 — 관리자·강사 본인(타인 403, B7 규약).
import { PayoutRecordDetailView } from '@/features/payouts/PayoutRecordDetailView';

export default async function PayoutDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PayoutRecordDetailView payoutId={Number(id)} />;
}
