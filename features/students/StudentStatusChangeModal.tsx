'use client';

import { useState } from 'react';
import { ModalShell } from '@/components/ui';
import { STUDENT_STATUS_OPTIONS } from '@/lib/domain/students';
import { useUpdateStudent } from '@/lib/queries';
import type { Student, StudentStatus } from '@/types';

type StudentStatusChangeModalProps = {
  student: Student;
  onClose: () => void;
};

/** 학생의 업무 상태 전이만 담당한다. 원부 soft delete와 의도적으로 분리한다. */
export function StudentStatusChangeModal({ student, onClose }: StudentStatusChangeModalProps) {
  const update = useUpdateStudent();
  const [status, setStatus] = useState<StudentStatus>(student.status);
  const [message, setMessage] = useState('');

  const save = () => {
    setMessage('');
    update.mutate({ id: student.id, patch: { status } }, {
      onSuccess: onClose,
      onError: () => setMessage('DB에서 상태 변경을 확정하지 못했습니다. 기존 상태로 되돌렸습니다.'),
    });
  };

  return (
    <ModalShell
      title={`${student.name} 학생 상태 변경`}
      onClose={onClose}
      bodyClassName="space-y-3"
      footer={(
        <>
          <button className="btn btn-sm" disabled={update.isPending} onClick={onClose}>취소</button>
          <button className="btn btn-sm btn-primary" disabled={update.isPending || status === student.status} onClick={save}>
            {update.isPending ? 'DB 확인 중…' : '상태 저장'}
          </button>
        </>
      )}
    >
      <p className="text-caption text-fg-muted">
        퇴원·등록이탈은 학생 원부와 이력을 보존하는 업무 상태입니다. 잘못 만든 중복 원부만 별도의 “원부 삭제”를 사용하세요.
      </p>
      <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="학생 등록 상태">
        {STUDENT_STATUS_OPTIONS.map((option) => (
          <label key={option.value} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 ${status === option.value ? 'border-accent bg-accent-subtle' : 'border-line-muted'}`}>
            <input
              type="radio"
              name="student-status"
              value={option.value}
              checked={status === option.value}
              onChange={() => setStatus(option.value)}
            />
            <span className="font-medium">{option.label}</span>
          </label>
        ))}
      </div>
      {message && <p className="text-caption text-danger" role="alert">{message}</p>}
    </ModalShell>
  );
}
