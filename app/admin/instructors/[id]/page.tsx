import { InstructorDetailView } from '@/features/admin/InstructorDetailView';

export default async function AdminInstructorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InstructorDetailView instructorId={Number(id)} />;
}
