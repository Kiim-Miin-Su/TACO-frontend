// SSR/CSR 하이드레이션 불일치를 막기 위해 locale/타임존 의존 포맷을 쓰지 않고
// 결정적(deterministic)으로 구현합니다. (toLocaleString/Date 포맷은 환경마다 결과가 달라짐)

export const won = (n: number) =>
  '₩' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// 'YYYY-MM-DD'(또는 datetime ISO) → 'MM/DD'
export const shortDate = (iso: string) => {
  const [, m, d] = iso.slice(0, 10).split('-');
  return m && d ? `${m}/${d}` : iso;
};
