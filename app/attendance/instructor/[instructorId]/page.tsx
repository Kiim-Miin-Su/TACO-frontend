import { InstructorAttendanceDetailView } from '@/features/attendance/InstructorAttendanceDetailView';
import { requirePageRouteId } from '@/lib/page-route-id';

export default async function Page({ params }: { params: Promise<{ instructorId: string }> }) {
  const { instructorId } = await params;
  return <InstructorAttendanceDetailView instructorId={requirePageRouteId(instructorId)} />;
}
