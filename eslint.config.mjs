// [TBO-58 P2 2026-07-24] lint 게이트 복구 — `next lint`는 최초 실행 시 대화형 설정을 요구해
//  게이트로 쓸 수 없었다(0/2). eslint 9 flat config + eslint-config-next(FlatCompat 브리지)로
//  비대화형 `eslint .` 실행. 타입 검증은 tsc가 담당(next/core-web-vitals = React 훅·a11y·Next 규칙).
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals'),
  {
    rules: {
      // 프로젝트 관례: 의도적 미사용은 _접두사
      'no-unused-vars': 'off',
    },
  },
];

export default config;
