// [TBO-32 C4 2026-07-22] payout-shared(정산 표시·판정 단일 진실원) 단위 검증 —
//  모든 정산 화면(리스트·강사별 요약·단건 상세·배너·일괄 모달)이 소비하는 규칙을 한곳에서 증명.
//  vitest include가 lib/** 이므로 여기(lib/domain)에 두고 features 모듈을 임포트한다.
import { describe, expect, it } from 'vitest';
import {
  PAYOUT_STATUS_LABEL, PAYOUT_STATUS_TONE,
  isReversedPayout, payoutDisplayStatus, payoutHours, monthPeriod, previousMonthYm,
} from '@/features/payouts/payout-shared';

describe('payout-shared — 상태 표기 단일 진실원', () => {
  it('상태 4종 라벨·톤이 전부 정의돼 있다', () => {
    (['pending', 'confirmed', 'paid', 'rejected'] as const).forEach((s) => {
      expect(PAYOUT_STATUS_LABEL[s]).toBeTruthy();
      expect(PAYOUT_STATUS_TONE[s]).toBeTruthy();
    });
  });

  it('회수 판별 — rejected + reversedAt 둘 다 있어야 회수', () => {
    expect(isReversedPayout({ status: 'rejected', reversedAt: '2026-07-01T00:00:00Z' })).toBe(true);
    expect(isReversedPayout({ status: 'rejected' })).toBe(false); // 단순 반려
    expect(isReversedPayout({ status: 'paid', reversedAt: '2026-07-01T00:00:00Z' })).toBe(false); // 방어적
  });

  it('표시 상태 — 회수됨은 반려와 구분, 나머지는 상태 라벨 그대로', () => {
    expect(payoutDisplayStatus({ status: 'rejected', reversedAt: '2026-07-01T00:00:00Z' }))
      .toEqual({ label: '회수됨', tone: 'danger' });
    expect(payoutDisplayStatus({ status: 'rejected' })).toEqual({ label: '반려', tone: 'danger' });
    expect(payoutDisplayStatus({ status: 'paid' })).toEqual({ label: '지급완료', tone: 'success' });
    expect(payoutDisplayStatus({ status: 'pending' })).toEqual({ label: '승인대기', tone: 'attention' });
  });
});

describe('payout-shared — 시수·기간 계산', () => {
  it('payoutHours — 분→시 소수 1자리, 빈 값은 0.0h', () => {
    expect(payoutHours(210)).toBe('3.5h');
    expect(payoutHours(90)).toBe('1.5h');
    expect(payoutHours(0)).toBe('0.0h');
    expect(payoutHours(undefined)).toBe('0.0h');
  });

  it('monthPeriod — 1일~말일(평년 2월·31일 달·윤년 검증)', () => {
    expect(monthPeriod('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthPeriod('2026-07')).toEqual({ from: '2026-07-01', to: '2026-07-31' });
    expect(monthPeriod('2026-06')).toEqual({ from: '2026-06-01', to: '2026-06-30' });
    expect(monthPeriod('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' }); // 윤년
  });

  it('monthPeriod — Date 입력도 같은 규칙', () => {
    expect(monthPeriod(new Date(2026, 6, 15))).toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });

  it('previousMonthYm — 연 경계(1월→전년 12월) 포함', () => {
    expect(previousMonthYm(new Date(2026, 6, 22))).toBe('2026-06'); // 7월 → 6월
    expect(previousMonthYm(new Date(2026, 0, 5))).toBe('2025-12'); // 1월 → 전년 12월
  });
});
