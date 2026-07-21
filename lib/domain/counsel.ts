import type { CounselForm } from '@/types';

/** 상담 예약 캘린더의 유일한 현재 예정일 소스는 counsel_forms.next_contact_at이다. */
export function counselReservationsOnDate(forms: readonly CounselForm[], date: string): CounselForm[] {
  return forms.filter((form) => form.nextContactAt === date);
}
