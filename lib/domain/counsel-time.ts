export type CounselKstDateTime = {
  date: string;
  time: string;
};

export const EMPTY_COUNSEL_KST_DATE_TIME: CounselKstDateTime = {
  date: '',
  time: '',
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function instantToCounselKstParts(instant?: string | null): CounselKstDateTime {
  if (!instant) return EMPTY_COUNSEL_KST_DATE_TIME;
  const value = new Date(instant);
  if (!Number.isFinite(value.getTime())) return EMPTY_COUNSEL_KST_DATE_TIME;

  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(value).map((part) => [part.type, part.value]));

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${String(Number(parts.hour) % 24).padStart(2, '0')}:${parts.minute}`,
  };
}

export function counselKstPartsToInstant(parts: CounselKstDateTime): string | null {
  if (!DATE_PATTERN.test(parts.date) || !TIME_PATTERN.test(parts.time)) return null;
  const timestamp = Date.parse(`${parts.date}T${parts.time}:00+09:00`);
  if (!Number.isFinite(timestamp)) return null;

  const instant = new Date(timestamp).toISOString();
  const roundTrip = instantToCounselKstParts(instant);
  return roundTrip.date === parts.date && roundTrip.time === parts.time ? instant : null;
}

export function formatCounselInstantKst(instant?: string | null): string {
  const parts = instantToCounselKstParts(instant);
  return parts.date && parts.time ? `${parts.date} ${parts.time}` : '미정';
}
