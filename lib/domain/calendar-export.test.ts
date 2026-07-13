import { describe, expect, it } from "vitest";
import { calendarExportFilename, uniqueVisiblePeople } from "./calendar-export";

describe("calendar export naming", () => {
  it("keeps pane order while removing duplicate visible users", () => {
    expect(uniqueVisiblePeople([
      { role: "instructor", name: "박지훈" },
      { role: "student", name: "김서연" },
      { role: "instructor", name: "박지훈" },
      { role: "student", name: "  이준호  " },
    ])).toEqual([
      { role: "instructor", name: "박지훈" },
      { role: "student", name: "김서연" },
      { role: "student", name: "이준호" },
    ]);
  });

  it("keeps the same name when the visible roles differ", () => {
    expect(uniqueVisiblePeople([
      { role: "instructor", name: "김민수" },
      { role: "student", name: "김민수" },
    ])).toHaveLength(2);
  });

  it("uses visible users, current date, and view name", () => {
    expect(calendarExportFilename({
      people: [
        { role: "instructor", name: "박지훈" },
        { role: "student", name: "김서연" },
      ],
      currentDate: "2026-07-13",
      view: "week",
      ext: "png",
    })).toBe("강사-박지훈_학생-김서연_260713_weekly.png");
  });

  it("falls back to the whole schedule and sanitizes forbidden characters", () => {
    expect(calendarExportFilename({ people: [], currentDate: "2026-07-13", view: "day", ext: "jpg" }))
      .toBe("전체스케줄_260713_daily.jpg");
    expect(calendarExportFilename({ people: [{ role: "instructor", name: "Kim / Jane" }], currentDate: "2026-07-13", view: "month", ext: "png" }))
      .toBe("강사-KimJane_260713_monthly.png");
  });
});
