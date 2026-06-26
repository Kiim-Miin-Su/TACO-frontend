export const won = (n: number) => `₩${n.toLocaleString('ko-KR')}`;

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
