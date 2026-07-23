import { RoadmapDetailView } from '@/features/admin/RoadmapDetailView';

// Next 15: params는 Promise. 서버에서 풀어 클라이언트 뷰에 number로 전달.
export default async function Page({ params }: { params: Promise<{ roadmapId: string }> }) {
  const { roadmapId } = await params;
  return <RoadmapDetailView roadmapId={Number(roadmapId)} />;
}
