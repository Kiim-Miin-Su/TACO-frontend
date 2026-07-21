import { describe, expect, it } from 'vitest';
import type { CounselForm } from '@/types';
import { counselReservationsOnDate } from './counsel';

const form = (id: number, nextContactAt?: string | null): CounselForm => ({
  id,
  applicantName: `상담 ${id}`,
  source: 'manual',
  submitterType: 'unknown',
  status: 'requested',
  nextContactAt,
  createdAt: '2026-07-21',
});

describe('counselReservationsOnDate', () => {
  it('counsel_forms.nextContactAt 한 값만으로 예약일을 선택한다', () => {
    const forms = [form(1, '2026-07-21'), form(2, null), form(3, '2026-07-22')];
    expect(counselReservationsOnDate(forms, '2026-07-21').map((row) => row.id)).toEqual([1]);
  });
});
