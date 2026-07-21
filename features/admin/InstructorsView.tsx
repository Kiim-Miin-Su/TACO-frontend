'use client';

import { useMemo, useState } from 'react';
import { Badge, ClickableTableRow, EmptyState, LoadingState, SectionCard, TableWrap } from '@/components/ui';
import { useAccountAccess } from '@/lib/useAccountAccess';
import { useInstructorAdminList } from '@/lib/queries';
import { CreateInstructorModal } from './instructors/CreateInstructorModal';

export function InstructorsView() {
  const { role } = useAccountAccess();
  const query = useInstructorAdminList();
  const rows = useMemo(() => [...(query.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'ko')), [query.data]);
  const [createOpen, setCreateOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isSuper = role === 'super_admin';

  return (
    <SectionCard title={`강사 (${rows.length})`} action={isSuper ? <button type="button" className="btn btn-sm btn-primary" onClick={() => setCreateOpen(true)}>+ 강사 등록</button> : undefined}>
      {message && <p className="px-4 pt-3 text-caption text-accent" role="status">{message}</p>}
      {query.isLoading ? <LoadingState rows={6} /> : rows.length === 0 ? <EmptyState message="등록된 활성 강사가 없습니다." /> : (
        <TableWrap minWidth={820}>
          <table className="table">
            <thead><tr><th>이름</th><th>아이디</th><th>연락처</th><th>학력</th><th>기본 시급</th><th>Kinder</th></tr></thead>
            <tbody>
              {rows.map((instructor) => (
                <ClickableTableRow key={instructor.id} href={`/admin/instructors/${instructor.id}`} label={`${instructor.name} 강사 상세`}>
                  <td className="font-medium">{instructor.name}</td>
                  <td className="mono text-fg-muted">{instructor.webId}</td>
                  <td>{instructor.phone ?? instructor.email ?? '—'}</td>
                  <td>{[instructor.university, instructor.major].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="mono">{instructor.defaultHourlyRate.toLocaleString('ko-KR')}원</td>
                  <td><Badge tone={instructor.canTeachKinder ? 'success' : 'neutral'}>{instructor.canTeachKinder ? '가능' : '불가'}</Badge></td>
                </ClickableTableRow>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {!isSuper && <p className="px-4 py-3 text-caption text-fg-subtle">강사 생성·수정·삭제는 대표만 가능합니다.</p>}
      {createOpen && <CreateInstructorModal onClose={() => setCreateOpen(false)} onCreated={(name) => { setCreateOpen(false); setMessage(`${name} 강사를 등록했습니다.`); }} />}
    </SectionCard>
  );
}
