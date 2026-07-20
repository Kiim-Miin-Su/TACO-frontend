'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Field, SectionCard } from '@/components/ui';
import { useCreateExpense } from '@/lib/queries';
import type { ExpenseCategory } from '@/types';
import { CATEGORIES, categoryLabel } from './labels';
import { useAccountAccess } from '@/lib/useAccountAccess';

const todayStr = () => new Date().toISOString().slice(0, 10);

export function ExpenseFormView() {
  const router = useRouter();
  const finance = useAccountAccess().can('finance.access');
  const createExpense = useCreateExpense();

  const [category, setCategory] = useState<ExpenseCategory>('supplies');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [spentAt, setSpentAt] = useState(todayStr());
  const [vendor, setVendor] = useState('');
  const [memo, setMemo] = useState('');
  const [receipt, setReceipt] = useState('');

  // [E0.6 L] FileReader 실패 처리 — 읽기 오류를 조용히 삼키지 않는다.
  const onFile = (f?: File) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setReceipt(String(reader.result));
    reader.onerror = () => setFormError('영수증 이미지를 읽지 못했습니다. 다른 파일로 시도해 주세요.');
    reader.readAsDataURL(f); // 데모: data URL (실제 백엔드는 업로드 후 URL 저장)
  };

  // [E0.6 M 2026-07-16] 조용한 실패·연타 중복 차단 — 인라인 검증+onError+제출 비활성.
  const [formError, setFormError] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!title.trim()) return setFormError('항목명을 입력해 주세요.');
    if (!amount || Number(amount) <= 0) return setFormError('금액을 입력해 주세요.');
    createExpense.mutate({
      category,
      title: title.trim(),
      amount: Number(amount),
      spentAt: spentAt || todayStr(),
      vendor: vendor.trim() || undefined,
      memo: memo.trim() || undefined,
      receiptUrl: receipt || undefined,
    }, {
      onSuccess: () => router.push('/expenses'),
      onError: (caught) => {
        const err = caught as { response?: { data?: { message?: string | string[] } } };
        const message = err.response?.data?.message;
        setFormError(Array.isArray(message) ? message.join(' ') : message ?? '지출을 등록하지 못했습니다. 다시 시도해 주세요.');
      },
    });
  };

  if (!finance) {
    return (
      <div className="p-6 max-w-[720px] mx-auto">
        <Link href="/expenses" className="text-caption text-fg-muted hover:underline">← 지출 목록</Link>
        <div className="mt-3 p-4 rounded-lg border text-body text-fg-muted border-line-muted">지출 등록은 대표(CEO) 전용입니다.</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[720px] mx-auto space-y-5">
      <div>
        <Link href="/expenses" className="text-caption text-fg-muted hover:underline">← 지출 목록</Link>
        <h1 className="text-title font-bold mt-1">지출 등록</h1>
      </div>
      <SectionCard title="지출 정보">
        <form onSubmit={submit} className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="분류 *">
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
              {CATEGORIES.map((c) => (<option key={c} value={c}>{categoryLabel[c]}</option>))}
            </select>
          </Field>
          <Field label="항목명 *"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="화이트보드 마커 외" /></Field>
          <Field label="금액(원) *"><input className="input" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="86000" /></Field>
          <Field label="지출일 *"><input type="date" className="input" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} /></Field>
          <Field label="거래처"><input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="오피스디포" /></Field>
          <Field label="메모"><input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="비고" /></Field>
          <div className="sm:col-span-2">
            {/* [E0.6 L] label-input 연결(접근성) */}
            <label htmlFor="expense-receipt" className="block text-caption font-medium text-fg-muted mb-1">영수증 사진</label>
            <input id="expense-receipt" type="file" accept="image/*" className="text-body" onChange={(e) => onFile(e.target.files?.[0])} />
            {receipt && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={receipt} alt="영수증 미리보기" className="mt-2 max-h-40 rounded border" />
            )}
          </div>
          <div className="sm:col-span-2 flex items-center justify-end gap-3 pt-1">
            {formError && <p className="text-body text-danger mr-auto" role="alert">{formError}</p>}
            <button type="submit" className="btn btn-primary" disabled={createExpense.isPending}>
              {createExpense.isPending ? '요청 중...' : '지출 요청'}
            </button>
          </div>
        </form>
      </SectionCard>
      <p className="text-caption text-fg-subtle">지출은 <b>대표(super_admin) 승인</b> 후 출금 원장·대시보드에 반영됩니다. (관리자 &gt; 승인 센터)</p>
    </div>
  );
}
