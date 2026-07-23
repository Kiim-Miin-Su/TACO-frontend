'use client';
// [TBO-30G 2026-07-23 대표 지시] 가족(형제·자매) 섹션 — **테이블 조인 단일 진실원** 소비로 승격.
//  종전: useStudents 전량 조회로 이름만 파생(full-list client join). 이제 useStudentFamily(서버 조인)가
//  구성원별 학생 원부·보호자·활성 수강·상담 이력·공유 보호자를 공급한다. 학생 상세와 상담 상세가
//  같은 이 컴포넌트·같은 훅을 쓰므로 두 화면의 가족 정보가 자동으로 동일 소스다.
//  가족 추가 시 "보호자 함께 연결" 옵션 — 같은 tx에서 관계 행 합집합(보호자 원부 복사 0).
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, ConfirmModal, EmptyState, Field, ModalShell, SectionCard, type Tone } from '@/components/ui';
import {
  useCreateStudentFamilyRelation,
  useRemoveStudentFamilyRelation,
  useStudentFamily,
  useStudents,
  useUpdateStudentFamilyRelation,
} from '@/lib/queries';
import type { StudentFamilyMember } from '@/lib/api';
import type { StudentFamilyRelation } from '@/types';
import { STUDENT_STATUS_LABEL, STUDENT_STATUS_TONE } from '@/lib/domain/students';
import { statusLabel as counselStatusLabel, statusTone as counselStatusTone } from '@/features/counsel/labels';
import { familyMemberSub, familyRelationLabel, hasSharedGuardian } from './family-shared';
import { StudentSearchSelect } from './StudentSearchSelect';

export function StudentFamilyRelationsSection({
  studentId,
  relations,
  canEdit,
}: {
  studentId: number;
  /** aggregate가 이미 들고 있는 관계 행 — 조인 로드 전 개수 표시·추가 모달 제외 목록에 사용. */
  relations: StudentFamilyRelation[];
  canEdit: boolean;
}) {
  // 표시 데이터 = 서버 조인 단일 진실원(학생·보호자·수강·상담) — 이름만 알던 전량 조회 조립 제거.
  const familyQuery = useStudentFamily(studentId);
  const members = familyQuery.data?.members ?? [];
  const { data: students = [] } = useStudents(); // 검색 셀렉트(추가 모달) 전용
  const create = useCreateStudentFamilyRelation();
  const update = useUpdateStudentFamilyRelation();
  const remove = useRemoveStudentFamilyRelation();
  const [adding, setAdding] = useState(false);
  const [relatedStudentId, setRelatedStudentId] = useState('');
  const [relationType, setRelationType] = useState<'sibling' | 'other'>('sibling');
  const [relationLabel, setRelationLabel] = useState('');
  const [linkGuardians, setLinkGuardians] = useState(true); // 형제 등록 관례 — 기본 공유
  const [editing, setEditing] = useState<StudentFamilyMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StudentFamilyMember | null>(null);
  const [error, setError] = useState('');
  const excludedIds = useMemo(
    () => new Set([studentId, ...relations.flatMap((relation) => [relation.studentIdA, relation.studentIdB])]),
    [relations, studentId],
  );

  const submitCreate = () => {
    if (!relatedStudentId) return setError('연결할 학생을 선택해 주세요.');
    if (relationType === 'other' && !relationLabel.trim()) return setError('기타 관계명을 입력해 주세요.');
    setError('');
    create.mutate({
      studentId,
      input: {
        relatedStudentId: Number(relatedStudentId), relationType,
        ...(relationType === 'other' ? { relationLabel: relationLabel.trim() } : {}),
        ...(linkGuardians ? { linkGuardians: true } : {}),
      },
    }, {
      onSuccess: () => { setAdding(false); setRelatedStudentId(''); setRelationType('sibling'); setRelationLabel(''); setLinkGuardians(true); },
      onError: () => setError('가족 관계를 추가하지 못했습니다.'),
    });
  };

  return (
    <>
      <SectionCard title={`가족 등록 (${relations.length})`} action={canEdit && !adding ? <button className="btn btn-sm" onClick={() => {
        setRelatedStudentId('');
        setRelationType('sibling');
        setRelationLabel('');
        setLinkGuardians(true);
        setError('');
        setAdding(true);
      }}>+ 가족 추가</button> : undefined}>
        {error && <p className="mb-3 text-caption text-danger" role="alert">{error}</p>}
        {!relations.length ? <EmptyState message="연결된 가족 학생이 없습니다." /> : <div className="divide-y border-line-muted">
          {members.map((member) => <div key={member.relationId} className="p-3 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/students/${member.student.id}`} className="font-medium text-accent hover:underline">{member.student.name}</Link>
              {editing?.relationId === member.relationId ? <>
                <select className="input w-auto" value={relationType} onChange={(event) => setRelationType(event.target.value as 'sibling' | 'other')}><option value="sibling">형제·자매</option><option value="other">기타</option></select>
                {relationType === 'other' && <input className="input w-40" value={relationLabel} onChange={(event) => setRelationLabel(event.target.value)} />}
                <button className="btn btn-sm btn-primary" onClick={() => update.mutate({ studentId, relationId: member.relationId, input: { relationType, ...(relationType === 'other' ? { relationLabel: relationLabel.trim() } : {}) } }, { onSuccess: () => setEditing(null), onError: () => setError('가족 관계를 수정하지 못했습니다.') })}>저장</button>
                <button className="btn btn-sm" onClick={() => setEditing(null)}>취소</button>
              </> : <>
                <span className="text-caption text-fg-muted">{familyRelationLabel(member)}</span>
                <Badge tone={STUDENT_STATUS_TONE[member.student.status] as Tone}>{STUDENT_STATUS_LABEL[member.student.status]}</Badge>
                {hasSharedGuardian(member) && <Badge tone="accent">보호자 공유</Badge>}
                {canEdit && <span className="sm:ml-auto flex gap-2"><button className="btn btn-sm" onClick={() => { setEditing(member); setRelationType(member.relationType); setRelationLabel(member.relationLabel ?? ''); }}>수정</button><button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(member)}>삭제</button></span>}
              </>}
            </div>
            {/* 조인 파생 요약 — 학년·학교 / 보호자 / 활성 수강 / 가족 상담 이력(카드 링크) */}
            <div className="text-caption text-fg-muted flex items-center gap-x-3 gap-y-1 flex-wrap">
              {familyMemberSub(member) && <span>{familyMemberSub(member)}</span>}
              <span>보호자 {member.guardians.length ? member.guardians.map((g) => `${g.parent.name}${g.relation.relation ? `(${g.relation.relation})` : ''}`).join(', ') : '—'}</span>
              <span>활성 수강 {member.activeEnrollmentCount}개</span>
              {member.counselForms.length > 0 && (
                <span className="flex items-center gap-1.5 flex-wrap">
                  상담
                  {member.counselForms.map((counsel) => (
                    <Link key={counsel.id} href={`/counsel/${counsel.id}`} className="inline-flex items-center gap-1 hover:underline">
                      <Badge tone={counselStatusTone[counsel.status]}>{counselStatusLabel[counsel.status]}</Badge>
                    </Link>
                  ))}
                </span>
              )}
            </div>
          </div>)}
          {/* 조인 로드 전엔 관계 수만 알 수 있음 — 로드 실패 시에도 CRUD는 가능해야 하므로 안내만 */}
          {familyQuery.isPending && relations.length > 0 && <p className="p-3 text-caption text-fg-subtle">가족 정보를 불러오는 중…</p>}
          {familyQuery.isError && <p className="p-3 text-caption text-danger" role="alert">가족 상세 정보를 불러오지 못했습니다.</p>}
        </div>}
      </SectionCard>
      {adding && <ModalShell title="등록 학생 검색 · 가족 연결" size="md" onClose={() => setAdding(false)} footer={<><button className="btn" onClick={() => setAdding(false)}>취소</button><button className="btn btn-primary" disabled={create.isPending || !relatedStudentId} onClick={submitCreate}>{create.isPending ? '연결 중…' : '가족 연결'}</button></>}>
        <div className="space-y-4">
          <StudentSearchSelect students={students} value={relatedStudentId ? Number(relatedStudentId) : null} onChange={(id) => setRelatedStudentId(id == null ? '' : String(id))} excludeIds={excludedIds} autoFocus />
          <Field label="가족 관계"><select className="input" value={relationType} onChange={(event) => setRelationType(event.target.value as 'sibling' | 'other')}><option value="sibling">형제·자매</option><option value="other">기타</option></select></Field>
          {relationType === 'other' && <Field label="기타 관계명"><input className="input" value={relationLabel} onChange={(event) => setRelationLabel(event.target.value)} /></Field>}
          {/* [TBO-30G] 보호자 조인 합집합 — 두 학생의 보호자를 관계 행으로 상호 연결(원부 복사 0·기존 대표 불변) */}
          <label className="flex items-start gap-2 text-body">
            <input type="checkbox" className="mt-1" checked={linkGuardians} onChange={(event) => setLinkGuardians(event.target.checked)} />
            <span>
              보호자도 함께 연결
              <span className="block text-caption text-fg-subtle">두 학생의 보호자를 서로에게도 연결합니다(같은 보호자 정보를 다시 입력하지 않아도 됩니다). 새 연결은 비대표로 추가되어 기존 대표 보호자는 그대로 유지됩니다.</span>
            </span>
          </label>
          {error && <p className="text-caption text-danger" role="alert">{error}</p>}
        </div>
      </ModalShell>}
      {deleteTarget && <ConfirmModal title="가족 관계 삭제" message={`${deleteTarget.student.name} 학생과의 가족 연결을 삭제할까요? 감사 이력은 유지됩니다.`} confirmLabel="삭제" danger onClose={() => setDeleteTarget(null)} onConfirm={() => remove.mutate({ studentId, relationId: deleteTarget.relationId }, { onSuccess: () => setDeleteTarget(null), onError: () => { setError('가족 관계를 삭제하지 못했습니다.'); setDeleteTarget(null); } })} />}
    </>
  );
}
