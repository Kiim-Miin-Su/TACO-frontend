// [TBO-34 C3 2026-07-23] API 오류 메시지 추출의 **단일 진실원** — `response?.data?.message`
//  파싱(문자열/배열/중첩)을 화면 9곳이 재구현하던 것을 이 함수 하나로 수렴한다.
//  민감 정보(스택·페이로드)는 노출하지 않고 서버 message 또는 fallback만 반환한다.
export function apiErrorMessage(caught: unknown, fallback: string): string {
  const data = (caught as { response?: { data?: { message?: string | string[] } } })?.response?.data;
  const message = data?.message;
  if (Array.isArray(message)) return message.join(' ');
  if (typeof message === 'string' && message.trim()) return message;
  return fallback;
}
