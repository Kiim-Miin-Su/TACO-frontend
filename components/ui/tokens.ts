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
