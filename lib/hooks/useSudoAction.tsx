'use client';

import { useRef, useSyncExternalStore } from 'react';
import { SudoActionModal } from '@/components/ui/SudoActionModal';
import { api } from '@/lib/api';
import {
  SudoActionCoordinator,
  type SudoActionOptions,
} from '@/lib/sudo-action';

export function useSudoAction() {
  const coordinatorRef = useRef<SudoActionCoordinator | null>(null);
  if (!coordinatorRef.current) coordinatorRef.current = new SudoActionCoordinator();
  const coordinator = coordinatorRef.current;
  const snapshot = useSyncExternalStore(
    coordinator.subscribe,
    coordinator.getSnapshot,
    coordinator.getSnapshot,
  );
  const awaitingPassword = snapshot.phase === 'awaiting_password' || snapshot.phase === 'reauth';

  return {
    run: <T,>(command: () => Promise<T>, options?: SudoActionOptions<T>) =>
      coordinator.run(command, options),
    isPending: snapshot.phase !== 'idle',
    modal: awaitingPassword ? (
      <SudoActionModal
        pending={snapshot.phase === 'reauth'}
        error={snapshot.error}
        onClose={() => coordinator.cancel()}
        onSubmit={(password) => {
          void coordinator.submitPassword(password, api.auth.reauth);
        }}
      />
    ) : null,
  };
}
