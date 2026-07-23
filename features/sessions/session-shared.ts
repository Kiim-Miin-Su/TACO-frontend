// [TBO-34 C3 2026-07-23] 세션 상태 표기의 **단일 진실원** — 종전 4곳(SessionsView·
//  ClassSessionDetailView·CourseDetailView·ReportWriteView)이 사본을 들고 있었고 이미 드리프트가
//  발생해 있었다(no_show가 화면마다 '결석'/'노쇼', 톤도 attention/danger 혼재). 다수형(3곳)으로
//  정규화: no_show='노쇼'(출결의 '결석'과 구분되는 세션 상태), 톤 danger.
import type { Tone } from '@/components/ui';
import type { SessionStatus } from '@/types';

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  scheduled: '예정', held: '진행완료', canceled: '취소', no_show: '노쇼', makeup: '보강',
};

export const SESSION_STATUS_TONE: Record<SessionStatus, Tone> = {
  scheduled: 'accent', held: 'success', canceled: 'danger', no_show: 'danger', makeup: 'attention',
};

/** 계약 밖 값 방어(과거 데이터·확장 대비) — 라벨은 원문, 톤은 중립. */
export const sessionStatusLabel = (status: string): string =>
  SESSION_STATUS_LABEL[status as SessionStatus] ?? status;
export const sessionStatusTone = (status: string): Tone =>
  SESSION_STATUS_TONE[status as SessionStatus] ?? 'neutral';
