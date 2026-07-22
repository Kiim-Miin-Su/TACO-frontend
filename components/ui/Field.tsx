import type { ReactNode } from 'react';

/**
 * Field — 폼 라벨 + 컨트롤 단일 규격 (DESIGN.md §5).
 * 각 뷰의 로컬 Field 중복 정의를 대체한다(StudentForm·PayoutsView 등).
 * 금지: 파일 내 로컬 Field 재정의.
 */
type FieldProps = {
  label: string;
  children: ReactNode;
  /** 보조 설명 — 컨트롤 아래 미세 텍스트 */
  hint?: ReactNode;
  /** 검증 오류 — danger 톤, hint보다 우선 표시 */
  error?: ReactNode;
};

export function Field({ label, children, hint, error }: FieldProps) {
  return (
    <label className="block">
      <span className="block text-caption font-medium text-fg-muted mb-1">{label}</span>
      {children}
      {error ? (
        <FieldError>{error}</FieldError>
      ) : (
        hint && <span className="block text-micro text-fg-subtle mt-1">{hint}</span>
      )}
    </label>
  );
}

export function FieldError({ children }: { children: ReactNode }) {
  return <span className="block text-micro text-danger mt-1" role="alert">{children}</span>;
}
