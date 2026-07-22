type FormFeedbackProps = {
  id?: string;
  kind: "error" | "status";
  message: string | null;
  className?: string;
};

/**
 * 폼의 동적 오류/상태 안내를 같은 DOM live region에서 갱신한다.
 * role 변경 없이 빈 노드를 먼저 렌더해 보조기기가 후속 메시지를 안정적으로 감지하게 한다.
 */
export function FormFeedback({ id, kind, message, className = "" }: FormFeedbackProps) {
  const tone = kind === "error" ? "text-danger" : "text-success";
  return (
    <p
      id={id}
      role={kind === "error" ? "alert" : "status"}
      aria-atomic="true"
      className={`${message ? `text-caption ${tone}` : "sr-only"} ${className}`.trim()}
    >
      {message ?? ""}
    </p>
  );
}
