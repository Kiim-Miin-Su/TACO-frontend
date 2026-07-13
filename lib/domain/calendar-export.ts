export type CalendarExportView = "month" | "week" | "day";

export function uniqueVisibleUserNames(names: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function calendarExportFilename(input: {
  userNames: Iterable<string>;
  currentDate: string;
  view: CalendarExportView;
  ext: "png" | "jpg";
}): string {
  const names = uniqueVisibleUserNames(input.userNames);
  const who = names.length ? names.join("_") : "전체스케줄";
  const date = input.currentDate.replaceAll("-", "").slice(2);
  const view = input.view === "month" ? "monthly" : input.view === "week" ? "weekly" : "daily";
  const safe = (value: string) => value.replace(/[\\/:*?"<>|\s]+/g, "");
  return `${safe(who)}_${date}_${view}.${input.ext}`;
}
