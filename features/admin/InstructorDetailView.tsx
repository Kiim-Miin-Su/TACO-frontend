'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, ConfirmModal, DetailStates, SectionCard } from '@/components/ui';
import { useAccountAccess } from '@/lib/useAccountAccess';
import { useInstructorAdminDetail, useRemoveInstructor, useUpdateInstructor } from '@/lib/queries';
import { InstructorProfileFields, type InstructorProfileForm } from './instructors/InstructorProfileFields';

const messageOf = (error: unknown) => {
  const value = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(value) ? value.join(' ') : value ?? '요청을 처리하지 못했습니다.';
};

export function InstructorDetailView({ instructorId }: { instructorId: number }) {
  const router = useRouter();
  const { role } = useAccountAccess();
  const query = useInstructorAdminDetail(instructorId);
  const update = useUpdateInstructor();
  const remove = useRemoveInstructor();
  const [edit, setEdit] = useState<InstructorProfileForm | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isSuper = role === 'super_admin';

  return (
    <DetailStates query={query} notFoundMessage="강사를 찾을 수 없습니다." backHref="/admin/instructors">
      {(instructor) => {
        const view: InstructorProfileForm = edit ?? {
          name: instructor.name,
          email: instructor.email ?? '',
          phone: instructor.phone ?? '',
          university: instructor.university ?? '',
          major: instructor.major ?? '',
          birthYear: instructor.birthYear == null ? '' : String(instructor.birthYear),
          countryCode: instructor.countryCode ?? '',
          timeZone: instructor.timeZone ?? '',
          defaultHourlyRate: String(instructor.defaultHourlyRate),
          canTeachKinder: instructor.canTeachKinder,
        };
        const beginEdit = () => { setError(null); setMessage(null); setEdit({ ...view }); };
        const save = () => {
          if (!edit || update.isPending) return;
          setError(null);
          update.mutate({ id: instructor.id, patch: {
            name: edit.name.trim(), email: edit.email.trim(), phone: edit.phone.trim(),
            university: edit.university.trim() || null, major: edit.major.trim() || null,
            birthYear: edit.birthYear ? Number(edit.birthYear) : null,
            countryCode: edit.countryCode.trim() || null, timeZone: edit.timeZone.trim() || null,
            defaultHourlyRate: Number(edit.defaultHourlyRate) || 0, canTeachKinder: edit.canTeachKinder,
          } }, {
            onSuccess: () => { setEdit(null); setMessage('강사 정보를 저장했습니다. 관련 수업·캘린더·정산 캐시를 갱신했습니다.'); },
            onError: (caught) => setError(messageOf(caught)),
          });
        };
        return (
          <SectionCard title={`${instructor.name} 강사`} action={<Badge tone="success">활성</Badge>}>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-body max-w-[720px]">
                <div><span className="text-fg-subtle">아이디</span><div className="mono">{instructor.webId}</div></div>
                <div><span className="text-fg-subtle">승인</span><div className="mono">#{instructor.approvedBy} · {instructor.approvedAt.slice(0, 10)}</div></div>
              </div>
              <InstructorProfileFields value={view} onChange={(next) => setEdit(next)} disabled={!edit} />
              {message && <p className="text-caption text-accent" role="status">{message}</p>}
              {error && <p className="text-caption text-danger" role="alert">{error}</p>}
              <div className="flex gap-2">
                {isSuper && (edit ? <>
                  <button type="button" className="btn btn-sm btn-primary" disabled={update.isPending || !edit.name.trim()} onClick={save}>{update.isPending ? '저장 중…' : '저장'}</button>
                  <button type="button" className="btn btn-sm" onClick={() => setEdit(null)}>취소</button>
                </> : <button type="button" className="btn btn-sm btn-primary" onClick={beginEdit}>수정</button>)}
                {isSuper && !edit && <button type="button" className="btn btn-sm btn-danger" onClick={() => setDeleteOpen(true)}>삭제</button>}
              </div>
              <p className="text-caption text-fg-subtle">기본 시급은 강사 프로필의 단일 진실원이며, 수업별 명시적 override가 없는 수업에 적용됩니다. 활성 수업·계약·스케줄이 있으면 삭제가 거부됩니다.</p>
            </div>
            {deleteOpen && <ConfirmModal title="강사 삭제" message="강사 계정과 프로필을 소프트 삭제합니다. 감사 이력은 보존됩니다." confirmLabel="삭제" danger onClose={() => setDeleteOpen(false)} onConfirm={() => {
              remove.mutate(instructor.id, {
                onSuccess: () => router.push('/admin/instructors'),
                onError: (caught) => { setDeleteOpen(false); setError(messageOf(caught)); },
              });
            }} />}
          </SectionCard>
        );
      }}
    </DetailStates>
  );
}
