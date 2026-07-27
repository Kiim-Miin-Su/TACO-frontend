import { InstructorDetailView } from '@/features/admin/InstructorDetailView';
import { requirePageRouteId } from '@/lib/page-route-id';

export default async function AdminInstructorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InstructorDetailView instructorId={requirePageRouteId(id)} />;
}
