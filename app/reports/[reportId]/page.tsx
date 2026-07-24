import { ReportDetailView } from '@/features/reports/ReportDetailView';

// [TBO-58 P2] 보고서 전용 상세페이지 — 딥링크 진입 경로(종전 인라인·승인센터 모달만, 검증① 갭).
// Next 15: params는 Promise. 서버에서 풀어 클라이언트 뷰에 number로 전달.
export default async function Page({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  return <ReportDetailView reportId={Number(reportId)} />;
}
