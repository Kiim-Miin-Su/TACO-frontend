import { PayoutDetailView } from '@/features/payouts/PayoutDetailView';
import { requirePageRouteId } from '@/lib/page-route-id';

// Next 15: params는 Promise. 서버에서 풀어 클라이언트 뷰에 number로 전달.
export default async function Page({ params }: { params: Promise<{ instructorId: string }> }) {
  const { instructorId } = await params;
  return <PayoutDetailView instructorId={requirePageRouteId(instructorId)} />;
}
