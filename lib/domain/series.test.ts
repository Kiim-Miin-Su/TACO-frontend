// [TBO-29C C2] 반복 규칙 KST 정규화 — 시차 사용자(현지 입력)와 KST 사용자 규칙 변환 검증.
import { describe, expect, it } from "vitest";
import { seriesRuleToKst } from "./series";

const identity = (date: string, time: string) => ({ date, time });

describe("seriesRuleToKst", () => {
  it("KST 사용자 — 항등(요일·기간·시각 무변화)", () => {
    const out = seriesRuleToKst({
      date: "2099-07-06", untilDate: "2099-07-19", repeat: "custom", customWds: [1, 3],
      toKst: identity, start: "16:00", end: "17:30",
    });
    expect(out).toEqual({ weekdays: [1, 3], startsOn: "2099-07-06", endsOn: "2099-07-19", startTime: "16:00", endTime: "17:30" });
  });

  it("weekly — 시작일 요일 1개로 정규화", () => {
    const out = seriesRuleToKst({
      date: "2099-07-07", untilDate: "2099-07-21", repeat: "weekly", customWds: [0, 5],
      toKst: identity, start: "09:00", end: "10:00",
    });
    expect(out.weekdays).toEqual([weekday("2099-07-07")]);
  });

  it("미 동부(전날 저녁) 입력 — KST 익일로 +1일·요일·기간 이동", () => {
    // 현지(뉴욕) 화 20:00 = KST 수 09:00(13h 차) — 날짜 +1일 이동을 흉내내는 변환기
    const nyToKst = (date: string, time: string) => {
      const [h, m] = time.split(":").map(Number);
      const shifted = h + 13;
      const nextDay = shifted >= 24;
      const d = new Date(`${date}T00:00:00Z`);
      if (nextDay) d.setUTCDate(d.getUTCDate() + 1);
      return { date: d.toISOString().slice(0, 10), time: `${String(shifted % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
    };
    const out = seriesRuleToKst({
      date: "2099-07-07", untilDate: "2099-07-21", repeat: "custom", customWds: [2, 4], // 화·목(현지)
      toKst: nyToKst, start: "20:00", end: "21:30",
    });
    expect(out.startsOn).toBe("2099-07-08"); // +1일
    expect(out.endsOn).toBe("2099-07-22");
    expect(out.weekdays).toEqual([3, 5]); // 수·금(KST)
    expect(out.startTime).toBe("09:00");
    expect(out.endTime).toBe("10:30");
  });

  it("요일 래핑 — 토(6)+1일 = 일(0)", () => {
    const plusOne = (date: string, time: string) => {
      const d = new Date(`${date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      return { date: d.toISOString().slice(0, 10), time };
    };
    const out = seriesRuleToKst({
      date: "2099-07-11", untilDate: "2099-07-25", repeat: "custom", customWds: [6],
      toKst: plusOne, start: "23:00", end: "23:30",
    });
    expect(out.weekdays).toEqual([0]);
  });
});

function weekday(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}
