import { describe, expect, it } from "vitest";
import { calendarExportFilename, uniqueVisibleUserNames } from "./calendar-export";

describe("calendar export naming", () => {
  it("keeps pane order while removing duplicate visible users", () => {
    expect(uniqueVisibleUserNames(["박지훈", "김서연", "박지훈", "  이준호  "])).toEqual([
      "박지훈",
      "김서연",
      "이준호",
    ]);
  });

  it("uses visible users, current date, and view name", () => {
    expect(calendarExportFilename({
      userNames: ["박지훈", "김서연"],
      currentDate: "2026-07-13",
      view: "week",
      ext: "png",
    })).toBe("박지훈_김서연_260713_weekly.png");
  });

  it("falls back to the whole schedule and sanitizes forbidden characters", () => {
    expect(calendarExportFilename({ userNames: [], currentDate: "2026-07-13", view: "day", ext: "jpg" }))
      .toBe("전체스케줄_260713_daily.jpg");
    expect(calendarExportFilename({ userNames: ["Kim / Jane"], currentDate: "2026-07-13", view: "month", ext: "png" }))
      .toBe("KimJane_260713_monthly.png");
  });
});
