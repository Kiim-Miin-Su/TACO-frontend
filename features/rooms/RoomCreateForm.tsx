'use client';

import { useState, type FormEvent } from 'react';
import type { Room } from '@/types';
import { apiErrorMessage } from '@/lib/api-error';
import { useCreateRoom } from '@/lib/queries';

export function RoomCreateForm({ compact = false, onCreated }: { compact?: boolean; onCreated?: (room: Room) => void }) {
  const createRoom = useCreateRoom();
  const [name, setName] = useState('');
  const [capacityValue, setCapacityValue] = useState('1');
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSuccess('');
    if (!name.trim()) { setFormError('강의실 이름을 입력해 주세요.'); return; }
    const capacity = Number(capacityValue);
    if (!Number.isInteger(capacity) || capacity < 1) { setFormError('정원은 1명 이상의 정수여야 합니다.'); return; }
    createRoom.mutate({ name: name.trim(), capacity }, {
      onSuccess: (created) => {
        setName('');
        setCapacityValue('1');
        setSuccess(`${created.name} 강의실을 등록했습니다.`);
        onCreated?.(created);
      },
      onError: (caught) => setFormError(apiErrorMessage(caught, '강의실을 추가하지 못했습니다. 다시 시도해 주세요.')),
    });
  };

  return (
    <form onSubmit={submit} className={`flex flex-wrap items-center gap-2 ${compact ? '' : 'p-4'}`}>
      <input className="input h-9 flex-1 min-w-[140px]" placeholder="강의실 이름 (예: A101)" aria-label="강의실 이름"
        value={name} onChange={(event) => setName(event.target.value)} />
      <input className="input h-9 w-24 text-right" type="number" min={1} placeholder="정원" aria-label="정원(명)"
        value={capacityValue} onChange={(event) => setCapacityValue(event.target.value)} />
      <button type="submit" className="btn btn-primary" disabled={createRoom.isPending}>
        {createRoom.isPending ? '추가 중…' : '강의실 추가'}
      </button>
      {formError && <span className="text-caption text-danger w-full" role="alert">{formError}</span>}
      {success && <span className="text-caption text-success w-full" role="status">{success}</span>}
    </form>
  );
}
