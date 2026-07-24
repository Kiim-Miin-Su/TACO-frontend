// [TBO-63 2026-07-24] 캘린더 undo 스택 — 대표 지시 "스케줄 변동 내역을 스택으로, cmd/ctrl+Z 시
//  pop 순서로 되돌리기, stack-size 100". UI 편집 세션 상태(업무 데이터 아님 — 서버 캐시 SSOT 유지):
//  스택에는 역연산 클로저만 담고, 실행 결과는 항상 서버 응답+무효화로 화면에 반영된다.
//  경계: 단일 회차 변경(이동·리사이즈·편집·삭제·생성)만 — 반복 시리즈 scope 편집·bulk 생성은
//  스택 제외(역연산이 다회차라 부분 실패 시 정합 위험 — 문서화된 한계, TBO-63).
export type ScheduleUndoEntry = {
  label: string; // 사람이 읽는 설명(예: "수업 이동 되돌리기")
  run: () => Promise<unknown>; // 역연산 — 실패는 호출부가 처리(스택에 재적재하지 않음)
};

const MAX_STACK = 100;
const stack: ScheduleUndoEntry[] = [];

export function pushScheduleUndo(entry: ScheduleUndoEntry): void {
  stack.push(entry);
  if (stack.length > MAX_STACK) stack.shift(); // 오래된 것부터 폐기(최근 100개 유지)
}

export function popScheduleUndo(): ScheduleUndoEntry | undefined {
  return stack.pop();
}

export function scheduleUndoSize(): number {
  return stack.length;
}

/** 테스트·로그아웃 등 초기화용. */
export function clearScheduleUndo(): void {
  stack.length = 0;
}
