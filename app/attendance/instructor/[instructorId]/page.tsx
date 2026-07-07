import { InstructorAttendanceDetailView } from '@/features/attendance/InstructorAttendanceDetailView';

export default async function Page({ params }: { params: Promise<{ instructorId: string }> }) {
  const { instructorId } = await params;
  return <InstructorAttendanceDetailView instructorId={Number(instructorId)} />;
}
