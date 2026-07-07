// [재사용/단일소스 2026-07-07] enum 라벨 레코드 → <Select> 옵션 배열.
//  목적: 같은 한글 라벨을 여러 <option>에 하드코딩하던 중복 제거.
//   상담 폼·상세·필터가 features/counsel/labels.ts의 라벨맵(startLabel·atmosphereLabel 등)을
//   **그대로** 옵션 소스로 쓰게 해, 라벨을 한 곳(labels.ts)에서만 관리한다.
//  순서: Object.entries는 문자열(비정수) 키의 삽입 순서를 보존(ES2015+) → 라벨맵 선언 순서 = 옵션 순서.
export type SelectOption = { value: string; label: string };

export const enumOptions = (labels: Record<string, string>): SelectOption[] =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));
