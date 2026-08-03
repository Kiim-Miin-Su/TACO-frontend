import { ScheduleCalendar } from "@/features/calendar/ScheduleCalendar";
import { parseCalendarCompareSearchParams } from "@/lib/navigation-security";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") params.set(key, value);
  }
  return <ScheduleCalendar initialSelection={parseCalendarCompareSearchParams(params)} />;
}
