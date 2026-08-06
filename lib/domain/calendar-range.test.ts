import { describe, expect, it } from "vitest";
import { calendarMinuteAtPointer, calendarRangeBetween } from "./calendar-range";

describe("calendar drag range", () => {
  it("pointer 위치를 30분 단위로 snap하고 축 끝을 넘지 않는다", () => {
    expect(calendarMinuteAtPointer({ clientY: 145, rectTop: 100, hourHeight: 60, gridMin: 480, gridMax: 1320, snapMinutes: 30 })).toBe(540);
    expect(calendarMinuteAtPointer({ clientY: 9999, rectTop: 100, hourHeight: 60, gridMin: 480, gridMax: 1320, snapMinutes: 30 })).toBe(1290);
  });

  it("아래 방향 drag는 시작과 마지막 slot을 모두 포함한다", () => {
    expect(calendarRangeBetween({ anchorMin: 630, currentMin: 690, gridMin: 480, gridMax: 1320, snapMinutes: 30 }))
      .toEqual({ startMin: 630, endMin: 720 });
  });

  it("위 방향 drag도 시간 순서로 정규화한다", () => {
    expect(calendarRangeBetween({ anchorMin: 720, currentMin: 630, gridMin: 480, gridMax: 1320, snapMinutes: 30 }))
      .toEqual({ startMin: 630, endMin: 750 });
  });
});
