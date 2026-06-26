import { FeedbackFormView } from '@/features/sessions/FeedbackFormView';

export default async function Page({
  params,
}: {
  params: Promise<{ sessionId: string; studentId: string }>;
}) {
  const { sessionId, studentId } = await params;
  return <FeedbackFormView sessionId={Number(sessionId)} studentId={Number(studentId)} />;
}
