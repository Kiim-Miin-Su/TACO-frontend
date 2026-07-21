import { describe, expect, it } from 'vitest';
import type { CounselForm } from '@/types';
import { counselReservationsOnDate, recentCounselForms } from './counsel';

const form = (id: number, nextContactAt?: string | null): CounselForm => ({
  id,
  studentId: id,
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

  it('상담 목록을 최근 생성 id 순으로 정렬하고 원본 배열은 바꾸지 않는다', () => {
    const forms = [form(1), form(3), form(2)];
    expect(recentCounselForms(forms).map((row) => row.id)).toEqual([3, 2, 1]);
    expect(forms.map((row) => row.id)).toEqual([1, 3, 2]);
  });
});
