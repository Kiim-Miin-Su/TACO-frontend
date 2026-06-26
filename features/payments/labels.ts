import type { PaymentStatus, PaymentMethod } from '@/types';
import type { Tone } from '@/components/ui';

export const statusLabel: Record<PaymentStatus, string> = {
  pending: '미수', paid: '완납', overdue: '연체', refunded: '환불', partial_refund: '부분환불',
};
export const statusTone: Record<PaymentStatus, Tone> = {
  pending: 'attention', paid: 'success', overdue: 'danger', refunded: 'neutral', partial_refund: 'done',
};
export const methodLabel: Record<PaymentMethod, string> = {
  card: '카드', transfer: '이체', cash: '현금', point: '포인트', etc: '기타',
};
export const METHODS: PaymentMethod[] = ['card', 'transfer', 'cash', 'point', 'etc'];
export const STATUSES: PaymentStatus[] = ['pending', 'paid', 'overdue', 'refunded', 'partial_refund'];
