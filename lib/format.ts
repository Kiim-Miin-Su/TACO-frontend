// SSR/CSR 하이드레이션 불일치를 막기 위해 locale/타임존 의존 포맷을 쓰지 않고
// 결정적(deterministic)으로 구현합니다. (toLocaleString/Date 포맷은 환경마다 결과가 달라짐)

export const won = (n: number) =>
  '₩' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// 'YYYY-MM-DD'(또는 datetime ISO) → 'MM/DD'
// [TBO-58 P2] 형식 방어 보강 — 종전엔 'not-a-date'처럼 하이픈만 있으면 'a/date'로 오변환됐다
//  (테스트 작성 중 발견). 날짜 형식이 아니면 원문 그대로(조용한 오표기 금지).
export const shortDate = (iso: string) => {
  const head = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(head)) return iso;
  const [, m, d] = head.split('-');
  return `${m}/${d}`;
};

// [E0.6 M 2026-07-16] 날짜 표기 통일 — timestamptz ISO(시각 포함)를 'YYYY-MM-DD'로.
//  Payments/Expenses가 raw ISO를 그대로 노출하던 문제의 공용 해소(빈 값은 em dash).
export const dateOnly = (iso?: string | null) => (iso ? iso.slice(0, 10) : '—');

// [TBO-65 P2 2026-07-26] KST '오늘' — BE time.util.todayKst와 동명·동형 규약.
//  tasks·MonthGrid의 UTC toISOString 사본 수렴(자정~09시 하루 어긋남 해소).
export const todayKst = (now = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (type: 'year' | 'month' | 'day') => parts.find((p) => p.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};
