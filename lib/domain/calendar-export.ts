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

// [TBO-29C C4.5] 내보내기 대상 인물 해석(순수) — 표 우선순위(수동 > 자동 시차 > 기본 표 > 필터 선택 > 우측 선택)를
//  컴포넌트에서 분리해 단위 테스트 가능하게 한다. name 해석 실패(id만 있는 경우)는 건너뛴다.
export type ExportPaneLike = { dim: string; ids: number[] };
export type ExportNameResolver = (dim: "instructor" | "student", id: number) => string | undefined;

export function resolveExportPeople(input: {
  manualPanes: ExportPaneLike[];
  autoTzPanes: ExportPaneLike[];
  basePanes: ExportPaneLike[];
  instructorIds: number[];
  studentIds: number[];
  selected?: { type: string; name: string } | null;
  nameOf: ExportNameResolver;
}): CalendarExportPerson[] {
  const people: CalendarExportPerson[] = [];
  const add = (dim: string, ids: number[]) => {
    if (dim !== "instructor" && dim !== "student") return;
    for (const id of ids) {
      const name = input.nameOf(dim, id);
      if (name) people.push({ role: dim, name });
    }
  };
  if (input.manualPanes.length) for (const pane of input.manualPanes) add(pane.dim, pane.ids);
  else if (input.autoTzPanes.length) for (const pane of input.autoTzPanes) add(pane.dim, pane.ids);
  else {
    for (const pane of input.basePanes) add(pane.dim, pane.ids);
    if (!input.basePanes.length) {
      add("instructor", input.instructorIds);
      add("student", input.studentIds);
    }
  }
  if (!people.length && input.selected && (input.selected.type === "instructor" || input.selected.type === "student")) {
    people.push({ role: input.selected.type, name: input.selected.name });
  }
  return people;
}
