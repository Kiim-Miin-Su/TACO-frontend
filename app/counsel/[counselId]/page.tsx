import { CounselDetailView } from '@/features/counsel/CounselDetailView';
import { requirePageRouteId } from '@/lib/page-route-id';

export default async function Page({
  params,
}: {
  params: Promise<{ counselId: string }>;
}) {
  const { counselId } = await params;
  return <CounselDetailView counselId={requirePageRouteId(counselId)} />;
}
