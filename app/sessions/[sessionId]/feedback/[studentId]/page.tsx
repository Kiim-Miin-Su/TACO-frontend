import { FeedbackFormView } from '@/features/sessions/FeedbackFormView';
import { requirePageRouteId } from '@/lib/page-route-id';

export default async function Page({
  params,
}: {
  params: Promise<{ sessionId: string; studentId: string }>;
}) {
  const { sessionId, studentId } = await params;
  return (
    <FeedbackFormView
      sessionId={requirePageRouteId(sessionId)}
      studentId={requirePageRouteId(studentId)}
    />
  );
}
