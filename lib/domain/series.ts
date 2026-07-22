// [TBO-29C C2] 반복 규칙의 KST 정규화 — 생성 모달의 현지(시차) 입력을 서버 bulk command 규칙으로 변환.
//  서버(POST /schedule/series)가 occurrence 날짜를 재계산·발급하므로, 프론트는 규칙만 KST로 옮긴다.
//  변환 규칙: 같은 시각 반복은 KST로 일정한 (일수, 요일) 델타를 가진다(Asia/Seoul 무DST 기준 —
//  DST 있는 시간대는 첫 발생일의 오프셋을 기간 전체에 적용: 기존 availability 반복과 동일한 근사).
import { weekdayOf } from "./schedule";

type SeriesRepeatKind = "weekly" | "custom";

export type SeriesRuleInput = {
  /** 시작일(현지) — 모달의 date */
  date: string;
  /** 종료일(현지) — 모달의 untilDate */
  untilDate: string;
  repeat: SeriesRepeatKind;
  /** custom일 때 선택 요일(현지) */
  customWds: number[];
  /** (현지 date, 시각) → KST 변환기 — KST 사용자는 항등 */
  toKst: (dateLocal: string, hhmm: string) => { date: string; time: string };
  /** 시작·종료 시각(현지) */
  start: string;
  end: string;
};

export type SeriesRuleKst = {
  weekdays: number[];
  startsOn: string;
  endsOn: string;
  startTime: string;
  endTime: string;
};

const addDaysISO = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** 현지 반복 규칙 → KST 규칙. 요일/기간은 (KST 변환의 일수 델타)만큼 균일 이동한다. */
export function seriesRuleToKst(input: SeriesRuleInput): SeriesRuleKst {
  const ks = input.toKst(input.date, input.start);
  const ke = input.toKst(input.date, input.end);
  const dayShift = Math.round((Date.parse(ks.date) - Date.parse(input.date)) / 86_400_000);
  const localWds = input.repeat === "weekly" ? [weekdayOf(input.date)] : input.customWds;
  const weekdays = [...new Set(localWds.map((wd) => (((wd + dayShift) % 7) + 7) % 7))].sort((a, b) => a - b);
  return {
    weekdays,
    startsOn: ks.date,
    endsOn: addDaysISO(input.untilDate, dayShift),
    startTime: ks.time,
    endTime: ke.time,
  };
}
