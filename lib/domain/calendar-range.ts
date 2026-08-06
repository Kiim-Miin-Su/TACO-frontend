export type CalendarMinuteRange = {
  startMin: number;
  endMin: number;
};

/** Pointer Y를 캘린더의 분 단위 좌표로 바꾸고 축 안에서 snap한다. */
export function calendarMinuteAtPointer(input: {
  clientY: number;
  rectTop: number;
  hourHeight: number;
  gridMin: number;
  gridMax: number;
  snapMinutes: number;
}): number {
  const { clientY, rectTop, hourHeight, gridMin, gridMax, snapMinutes } = input;
  const raw = gridMin + ((clientY - rectTop) / hourHeight) * 60;
  const snapped = Math.round(raw / snapMinutes) * snapMinutes;
  return Math.max(gridMin, Math.min(gridMax - snapMinutes, snapped));
}

/** 시작 slot과 현재 pointer slot을 포함하는 범위를 반환한다. 역방향 drag도 같은 규칙을 쓴다. */
export function calendarRangeBetween(input: {
  anchorMin: number;
  currentMin: number;
  gridMin: number;
  gridMax: number;
  snapMinutes: number;
}): CalendarMinuteRange {
  const { anchorMin, currentMin, gridMin, gridMax, snapMinutes } = input;
  const startMin = Math.max(gridMin, Math.min(anchorMin, currentMin));
  const endMin = Math.min(gridMax, Math.max(anchorMin, currentMin) + snapMinutes);
  return { startMin, endMin };
}
