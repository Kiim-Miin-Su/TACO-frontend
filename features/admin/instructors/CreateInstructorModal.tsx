'use client';

import { ModalShell } from '@/components/ui';
import { InstructorCreateForm } from './InstructorCreateForm';

export function CreateInstructorModal({ onClose, onCreated }: { onClose: () => void; onCreated: (name: string) => void }) {
  return (
    <ModalShell title="강사 등록" size="lg" onClose={onClose} footer={<button type="button" className="btn btn-sm" onClick={onClose}>닫기</button>}>
      <InstructorCreateForm onCreated={(created) => onCreated(created.name)} />
    </ModalShell>
  );
}
