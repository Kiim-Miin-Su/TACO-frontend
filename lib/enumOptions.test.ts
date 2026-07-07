import { describe, it, expect } from 'vitest';
import { enumOptions } from './enumOptions';

describe('enumOptions (재사용 Select 옵션 단일소스)', () => {
  it('라벨 레코드를 선언 순서 유지하며 {value,label}[]로 변환', () => {
    const labels = { immediately: '즉시', within_1_month: '1개월 내', undecided: '미정' };
    expect(enumOptions(labels)).toEqual([
      { value: 'immediately', label: '즉시' },
      { value: 'within_1_month', label: '1개월 내' },
      { value: 'undecided', label: '미정' },
    ]);
  });

  it('빈 레코드 → 빈 배열', () => {
    expect(enumOptions({})).toEqual([]);
  });

  it('value는 레코드 키, label은 값 — 키/값을 뒤집지 않음', () => {
    const out = enumOptions({ self_directed: '자기주도' });
    expect(out[0]).toEqual({ value: 'self_directed', label: '자기주도' });
  });
});
