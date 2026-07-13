import { roleLabel } from "@/lib/roles";

export type CalendarExportView = "month" | "week" | "day";
export type CalendarExportPerson = { role: "instructor" | "student"; name: string };

export function uniqueVisiblePeople(people: Iterable<CalendarExportPerson>): CalendarExportPerson[] {
  const seen = new Set<string>();
  const out: CalendarExportPerson[] = [];
  for (const person of people) {
    const name = person.name.trim();
    const key = `${person.role}:${name}`;
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...person, name });
  }
  return out;
}

export function calendarExportFilename(input: {
  people: Iterable<CalendarExportPerson>;
  currentDate: string;
  view: CalendarExportView;
  ext: "png" | "jpg";
}): string {
  const people = uniqueVisiblePeople(input.people);
  const who = people.length
    ? people.map((person) => `${roleLabel[person.role]}-${person.name}`).join("_")
    : "전체스케줄";
  const date = input.currentDate.replaceAll("-", "").slice(2);
  const view = input.view === "month" ? "monthly" : input.view === "week" ? "weekly" : "daily";
  const safe = (value: string) => value.replace(/[\\/:*?"<>|\s]+/g, "");
  return `${safe(who)}_${date}_${view}.${input.ext}`;
}
