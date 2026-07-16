'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Field, SectionCard } from '@/components/ui';
import { useStudents, useCourses, useEnrollments, useCreatePayment } from '@/lib/queries';
import { useAccountAccess } from '@/lib/useAccountAccess';
import type { PaymentMethod } from '@/types';
import { won } from '@/lib/format';
import { METHODS, methodLabel } from './labels';

export function PaymentFormView() {
  const router = useRouter();
  const finance = useAccountAccess().can('finance.access');
  const { data: students = [] } = useStudents();
  const { data: courses = [] } = useCourses();
  const { data: enrollments = [] } = useEnrollments();
  const createPayment = useCreatePayment();

  const [studentId, setStudentId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [dueAt, setDueAt] = useState('');

  const pickCourse = (id: string) => {
    setCourseId(id);
    const c = courses.find((x) => x.id === Number(id));
    if (c) setAmount(String(c.price)); // 기본 금액 = 코스 정가
  };

  const enrollment = enrollments.find(
    (e) => e.studentId === Number(studentId) && e.courseId === Number(courseId),
  );

  // [E0.6 M 2026-07-16] 조용한 실패·연타 중복 생성 차단 — 인라인 검증 메시지+onError+제출 비활성.
  const [formError, setFormError] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!studentId) return setFormError('학생을 선택해 주세요.');
    if (!amount || Number(amount) <= 0) return setFormError('청구 금액을 입력해 주세요.');
    createPayment.mutate({
      studentId: Number(studentId),
      enrollmentId: enrollment?.id,
      amount: Number(amount),
      paymentMethod: (method || undefined) as PaymentMethod | undefined,
      dueAt: dueAt || undefined,
    }, {
      onSuccess: () => router.push('/payments'),
      onError: (caught) => {
        const err = caught as { response?: { data?: { message?: string | string[] } } };
        const message = err.response?.data?.message;
        setFormError(Array.isArray(message) ? message.join(' ') : message ?? '청구를 생성하지 못했습니다. 다시 시도해 주세요.');
      },
    });
  };

  if (!finance) {
    return (
      <div className="p-6 max-w-[720px] mx-auto space-y-4">
        <Link href="/payments" className="text-caption text-fg-muted hover:underline">← 결제 목록</Link>
        <div className="p-4 rounded-lg border text-body text-fg-muted border-line-muted">결제 청구 등록은 대표(CEO) 전용입니다.</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[720px] mx-auto space-y-5">
      <div>
        <Link href="/payments" className="text-caption text-fg-muted hover:underline">← 결제 목록</Link>
        <h1 className="text-title font-bold mt-1">신규 청구</h1>
      </div>
      <SectionCard title="청구 정보">
        <form onSubmit={submit} className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="학생 *">
            <select className="input" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">선택</option>
              {students.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </Field>
          <Field label="코스">
            <select className="input" value={courseId} onChange={(e) => pickCourse(e.target.value)}>
              <option value="">선택</option>
              {courses.map((c) => (<option key={c.id} value={c.id}>{c.name} ({won(c.price)})</option>))}
            </select>
          </Field>
          <Field label="금액(원) *">
            <input className="input" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="480000" />
          </Field>
          <Field label="결제 수단">
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">선택</option>
              {METHODS.map((m) => (<option key={m} value={m}>{methodLabel[m]}</option>))}
            </select>
          </Field>
          <Field label="납부 기한">
            <input type="date" className="input" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </Field>
          <div className="sm:col-span-2 flex items-center justify-between pt-1">
            <span className="text-caption text-fg-subtle">
              {studentId && courseId ? (enrollment ? '수강 등록 연결됨' : '연결된 수강 등록 없음(청구만 생성)') : ''}
            </span>
            {formError && <p className="text-body text-danger mr-auto" role="alert">{formError}</p>}
            <button type="submit" className="btn btn-primary" disabled={createPayment.isPending}>
              {createPayment.isPending ? '생성 중...' : '청구 생성'}
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}
