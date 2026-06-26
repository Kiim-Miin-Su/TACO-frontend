import { PaymentDetailView } from '@/features/payments/PaymentDetailView';

export default async function Page({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;
  return <PaymentDetailView paymentId={Number(paymentId)} />;
}
