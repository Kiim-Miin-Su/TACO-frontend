'use client';
// [IA 3분할 2026-07-07] 상담 신청 폼 = 독립 페이지(종이 서식처럼 크게·여백 넉넉).
//  목록(/counsel)에서 "+ 상담 신청" → 여기. 제출 성공 시 목록으로 복귀.
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { CounselForm } from './CounselForm';

export function CounselNewView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const phoneIntake = searchParams.get('mode') === 'phone';
  return (
    <div className="p-6 max-w-page-form mx-auto space-y-4">
      <Link href="/counsel" className="text-caption text-fg-muted hover:underline">← 상담 목록</Link>
      <PageHeader title={phoneIntake ? '긴급 전화 상담' : '상담 신청'} sub="신규 학생은 원부 등록과 상담카드가 한 번에 저장됩니다" />
      <div className="card p-6 sm:p-8">
        <CounselForm initialMode={phoneIntake ? 'new' : 'existing'} onSubmitted={() => router.push('/counsel')} />
      </div>
    </div>
  );
}
