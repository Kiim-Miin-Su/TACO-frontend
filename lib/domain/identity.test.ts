// [TBO-65 P2 4-A/B] BE common/digits.util과의 **동형 계약** 고정 — 산식이 어긋나면 보호자 중복
//  판정이 서버(등록 400)와 화면(폼 검증)에서 달라진다. BE e2e(user-journeys)가 서버측을 고정.
import { describe, expect, it } from 'vitest';
import { guardianKey, onlyDigits } from '@/lib/domain/identity';

describe('domain/identity — BE digits.util 동형 계약', () => {
  it('onlyDigits — 하이픈·공백·괄호·문자 전부 제거(\\D 규약)', () => {
    expect(onlyDigits('010-1234-5678')).toBe('01012345678');
    expect(onlyDigits('(02) 555 0100')).toBe('025550100');
    expect(onlyDigits('abc')).toBe('');
  });
  it('guardianKey — 이름 trim·소문자 + 전화 숫자만 (서버 중복 판정과 동형)', () => {
    expect(guardianKey('  Kim Mina ', '010-1234-5678')).toBe('kim mina:01012345678');
    expect(guardianKey('kim mina', '01012345678')).toBe('kim mina:01012345678'); // 표기 달라도 같은 키
    expect(guardianKey('KIM MINA', '010 1234 5678')).toBe('kim mina:01012345678');
  });
});
