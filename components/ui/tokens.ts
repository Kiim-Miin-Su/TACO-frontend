// 시맨틱 색조. globals.css의 토큰과 1:1 대응.
export type Tone = "neutral" | "accent" | "success" | "attention" | "danger" | "done";

export const dotColor: Record<Tone, string> = {
  neutral: "var(--color-fg-subtle)",
  accent: "var(--color-accent)",
  success: "var(--color-success)",
  attention: "var(--color-attention)",
  danger: "var(--color-danger)",
  done: "var(--color-done)",
};

// tone → 캘린더 칩 등 배경/글자색 (badge-* 와 동일 팔레트)
export const toneBg: Record<Tone, string> = {
  neutral: "var(--color-neutral-subtle)",
  accent: "var(--color-accent-subtle)",
  success: "var(--color-success-subtle)",
  attention: "var(--color-attention-subtle)",
  danger: "var(--color-danger-subtle)",
  done: "var(--color-done-subtle)",
};
export const toneFg: Record<Tone, string> = {
  neutral: "var(--color-fg-muted)",
  accent: "var(--color-accent)",
  success: "var(--color-success)",
  attention: "var(--color-attention)",
  danger: "var(--color-danger)",
  done: "var(--color-done)",
};
