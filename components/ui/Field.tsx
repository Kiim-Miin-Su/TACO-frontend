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
  /** [TBO-86I-3] 다중 컨트롤 그룹은 div로 렌더 — <label>은 헤더 클릭이 첫 labelable 자식
   *  (버튼 등)으로 전달되고(실측: 학생 라벨 클릭 → "수강생 전체" 오발동), 내부에 체크리스트
   *  <label>이 있으면 중첩 label 무효 마크업이 된다. 단일 입력 필드는 기존 label 유지. */
  asDiv?: boolean;
};

export function Field({ label, children, hint, error, asDiv }: FieldProps) {
  const Tag = asDiv ? 'div' : 'label';
  return (
    <Tag className="block">
      <span className="block text-caption font-medium text-fg-muted mb-1">{label}</span>
      {children}
      {error ? (
        <FieldError>{error}</FieldError>
      ) : (
        hint && <span className="block text-micro text-fg-subtle mt-1">{hint}</span>
      )}
    </Tag>
  );
}

export function FieldError({ children }: { children: ReactNode }) {
  return <span className="block text-micro text-danger mt-1" role="alert">{children}</span>;
}
