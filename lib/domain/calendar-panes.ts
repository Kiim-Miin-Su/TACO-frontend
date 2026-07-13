import type { SplitDim } from "./lantiv";

export type CalendarPaneSeed = { dim: SplitDim; ids: number[] };

export type ResourceFilterSeedInput = {
  instructors: Iterable<number>;
  students: Iterable<number>;
  rooms: Iterable<number>;
  fallbackInstructorId?: number;
};

const copy = (values: Iterable<number>) => [...values];

export function primaryPaneSeed(input: ResourceFilterSeedInput): CalendarPaneSeed {
  const instructors = copy(input.instructors);
  if (instructors.length) return { dim: "instructor", ids: instructors };
  const students = copy(input.students);
  if (students.length) return { dim: "student", ids: students };
  const rooms = copy(input.rooms);
  if (rooms.length) return { dim: "room", ids: rooms };
  if (input.fallbackInstructorId != null) return { dim: "instructor", ids: [input.fallbackInstructorId] };
  return { dim: "instructor", ids: [] };
}

export function currentPaneSeeds(input: ResourceFilterSeedInput): CalendarPaneSeed[] {
  const panes: CalendarPaneSeed[] = [];
  const instructors = copy(input.instructors);
  const students = copy(input.students);
  const rooms = copy(input.rooms);
  if (instructors.length) panes.push({ dim: "instructor", ids: instructors });
  if (students.length) panes.push({ dim: "student", ids: students });
  if (rooms.length) panes.push({ dim: "room", ids: rooms });
  return panes.length ? panes : [primaryPaneSeed(input)];
}

export function companionPaneSeed(seed: CalendarPaneSeed): CalendarPaneSeed {
  if (seed.ids.length) return { dim: seed.dim, ids: [...seed.ids] };
  if (seed.dim === "instructor") return { dim: "student", ids: [] };
  return { dim: "instructor", ids: [] };
}

export function appendCalendarPane<T extends CalendarPaneSeed & { uid: number }>(panes: T[], uid: number): T[] {
  const last = panes.at(-1);
  const seed = last ? companionPaneSeed(last) : { dim: "instructor" as const, ids: [] };
  return [...panes, { uid, ...seed } as T];
}
