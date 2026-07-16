// SSR/CSR 하이드레이션 불일치를 막기 위해 locale/타임존 의존 포맷을 쓰지 않고
// 결정적(deterministic)으로 구현합니다. (toLocaleString/Date 포맷은 환경마다 결과가 달라짐)

export const won = (n: number) =>
  '₩' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// 'YYYY-MM-DD'(또는 datetime ISO) → 'MM/DD'
export const shortDate = (iso: string) => {
  const [, m, d] = iso.slice(0, 10).split('-');
  return m && d ? `${m}/${d}` : iso;
};

// [E0.6 M 2026-07-16] 날짜 표기 통일 — timestamptz ISO(시각 포함)를 'YYYY-MM-DD'로.
//  Payments/Expenses가 raw ISO를 그대로 노출하던 문제의 공용 해소(빈 값은 em dash).
export const dateOnly = (iso?: string | null) => (iso ? iso.slice(0, 10) : '—');
