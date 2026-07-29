'use client';

import { hasCapability } from '@/lib/access-control';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, ConfirmModal, DetailStates, EmptyState, LoadingState, SectionCard, TableWrap } from '@/components/ui';
import { useAccountAccess } from '@/lib/useAccountAccess';
import { useInstructorAdminDetail, useInstructorContracts, useRemoveInstructor, useUpdateInstructor } from '@/lib/queries';
import { apiErrorMessage } from '@/lib/api-error';
import { InstructorProfileFields, type InstructorProfileForm } from './instructors/InstructorProfileFields';
import { InstructorContractModal } from './instructors/InstructorContractModal';
import type { InstructorContract } from '@kms545487/contracts';
import { dateOnly, won } from '@/lib/format';

// [75A] lib/api-error 단일 진실원 위임(로컬 파싱 재구현 제거)
const messageOf = (error: unknown) => apiErrorMessage(error, '요청을 처리하지 못했습니다.');

export function InstructorDetailView({ instructorId }: { instructorId: number }) {
  const router = useRouter();
  const { role } = useAccountAccess();
  const query = useInstructorAdminDetail(instructorId);
  const contractsQuery = useInstructorContracts(instructorId);
  const update = useUpdateInstructor();
  const remove = useRemoveInstructor();
  const [edit, setEdit] = useState<InstructorProfileForm | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contractModal, setContractModal] = useState<InstructorContract | 'create' | null>(null);
  const isSuper = hasCapability(role, 'executive.manage');

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
        const contracts = contractsQuery.data ?? [];
        return (
          <div className="space-y-5">
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

            {isSuper && (
              <SectionCard
                title="기간 계약"
                action={<button type="button" className="btn btn-sm btn-primary" onClick={() => setContractModal('create')}>계약 등록</button>}
              >
                {contractsQuery.isPending ? <LoadingState message="계약을 불러오는 중입니다." /> : contracts.length === 0 ? (
                  <EmptyState message="등록된 계약이 없습니다." />
                ) : (
                  <TableWrap>
                    <table className="w-full text-body">
                      <thead><tr><th>기간</th><th>월 기준 시수</th><th>시간당 시급</th><th>상태</th><th><span className="sr-only">작업</span></th></tr></thead>
                      <tbody>
                        {contracts.map((contract) => (
                          <tr key={contract.id}>
                            <td className="mono">{dateOnly(contract.periodStart)} ~ {contract.periodEnd ? dateOnly(contract.periodEnd) : '계속'}</td>
                            <td className="mono">{contract.monthlyHours}시간</td>
                            <td className="mono">{won(contract.hourlyRate)}</td>
                            <td><Badge tone={contract.active ? 'success' : 'neutral'}>{contract.active ? '활성' : '종료'}</Badge></td>
                            <td className="text-right"><button type="button" className="btn btn-sm" onClick={() => setContractModal(contract)}>변경</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                )}
              </SectionCard>
            )}

            {contractModal && (
              <InstructorContractModal
                instructorId={instructor.id}
                contract={contractModal === 'create' ? undefined : contractModal}
                onClose={() => setContractModal(null)}
                onSaved={setMessage}
              />
            )}
          </div>
        );
      }}
    </DetailStates>
  );
}
