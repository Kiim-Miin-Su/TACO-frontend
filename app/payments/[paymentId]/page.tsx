import { PaymentDetailView } from '@/features/payments/PaymentDetailView';
import { requirePageRouteId } from '@/lib/page-route-id';

export default async function Page({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;
  return <PaymentDetailView paymentId={requirePageRouteId(paymentId)} />;
}
