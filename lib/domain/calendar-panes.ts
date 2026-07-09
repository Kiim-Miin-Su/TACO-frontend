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

export function companionPaneSeed(seed: CalendarPaneSeed): CalendarPaneSeed {
  if (seed.ids.length) return { dim: seed.dim, ids: [...seed.ids] };
  if (seed.dim === "instructor") return { dim: "student", ids: [] };
  return { dim: "instructor", ids: [] };
}
