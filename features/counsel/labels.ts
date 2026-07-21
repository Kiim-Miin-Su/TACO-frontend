import type {
  CounselStatus,
  CounselSource,
  CounselResult,
} from '@/types';
import type { Tone } from '@/components/ui';

export const statusLabel: Record<CounselStatus, string> = {
  requested: '접수', pending: '진행중', registered: '등록완료', dropped: '미등록',
};
export const statusTone: Record<CounselStatus, Tone> = {
  requested: 'accent', pending: 'attention', registered: 'success', dropped: 'danger',
};
export const sourceLabel: Record<CounselSource, string> = {
  internal_form: '내부폼', naver_form: '네이버폼', google_form: '구글폼', manual: '수기접수', etc: '기타',
};
export const resultLabel: Record<CounselResult, string> = {
  positive: '긍정', neutral: '중립', negative: '부정', no_response: '무응답', registered: '등록',
};
export const resultTone: Record<CounselResult, Tone> = {
  positive: 'success', neutral: 'neutral', negative: 'danger', no_response: 'attention', registered: 'done',
};
export const STATUSES: CounselStatus[] = ['requested', 'pending', 'registered', 'dropped'];
export const RESULTS: CounselResult[] = ['positive', 'neutral', 'negative', 'no_response', 'registered'];
