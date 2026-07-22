// 브라우저 API debug는 요청 body도 지나가므로 자격증명뿐 아니라 가입/학생 PII 전체를 키 단계에서 가린다.
const SENSITIVE_KEY = /(authorization|access_?token|refresh_?token|token|password|secret|email|phone|code|rrn|resident|birth|address|kakao|counsel|web_?id|name$|university|major|school)/i;

export function safeLogValue(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth > 4) return '[redacted-depth]';
  if (typeof value === 'string') {
    return value
      .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[redacted-email]')
      .replace(/\b\d{6}-?[1-8]\d{6}\b/g, '[redacted-rrn]')
      .replace(/\b0\d{1,2}-\d{3,4}-\d{4}\b/g, '[redacted-phone]');
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => safeLogValue(item, depth + 1));

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, val]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[redacted]' : safeLogValue(val, depth + 1),
    ]),
  );
}

export function safeUrlForLog(rawUrl: string | undefined): string {
  if (!rawUrl) return '';
  try {
    const url = new URL(rawUrl, 'http://taco.local');
    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_KEY.test(key)) url.searchParams.set(key, '[redacted]');
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return String(safeLogValue(rawUrl));
  }
}
