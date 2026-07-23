// [TBO-34 C3 2026-07-23] 오류 파싱·상태 라벨 단일 진실원 검증(9곳 사설 정의 수렴 회귀 가드)
import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from './api-error';
import { SESSION_STATUS_LABEL, SESSION_STATUS_TONE, sessionStatusLabel, sessionStatusTone } from '@/features/sessions/session-shared';
import { ENROLLMENT_STATUS_LABEL, ENROLLMENT_STATUS_TONE } from '@/lib/domain/enrollments';

describe('apiErrorMessage — 서버 message 파싱 단일 소스', () => {
  it('문자열·배열·누락·비표준 형태 전부 안전', () => {
    expect(apiErrorMessage({ response: { data: { message: '중복입니다' } } }, 'f')).toBe('중복입니다');
    expect(apiErrorMessage({ response: { data: { message: ['a', 'b'] } } }, 'f')).toBe('a b');
    expect(apiErrorMessage({ response: { data: {} } }, '기본')).toBe('기본');
    expect(apiErrorMessage(new Error('net'), '기본')).toBe('기본');
    expect(apiErrorMessage({ response: { data: { message: '   ' } } }, '기본')).toBe('기본');
  });
});

describe('세션·수강 상태 라벨(사본 4+3곳 수렴 회귀 가드)', () => {
  it('세션 5상태 전부 정의 + 계약 밖 값 방어', () => {
    (['scheduled', 'held', 'canceled', 'no_show', 'makeup'] as const).forEach((s) => {
      expect(SESSION_STATUS_LABEL[s]).toBeTruthy();
      expect(SESSION_STATUS_TONE[s]).toBeTruthy();
    });
    expect(SESSION_STATUS_LABEL.no_show).toBe('노쇼'); // 드리프트('결석') 정규화 고정
    expect(sessionStatusLabel('unknown_x')).toBe('unknown_x');
    expect(sessionStatusTone('unknown_x')).toBe('neutral');
  });

  it('수강 4상태 전부 정의', () => {
    (['active', 'paused', 'completed', 'canceled'] as const).forEach((s) => {
      expect(ENROLLMENT_STATUS_LABEL[s]).toBeTruthy();
      expect(ENROLLMENT_STATUS_TONE[s]).toBeTruthy();
    });
  });
});
