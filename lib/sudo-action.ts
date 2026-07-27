import { clearSudo, isSudoRequiredError, markSudoVerified } from './sudo';

export type SudoActionPhase = 'idle' | 'command' | 'awaiting_password' | 'reauth' | 'retry';

export type SudoActionSnapshot = {
  phase: SudoActionPhase;
  error: unknown | null;
};

export type SudoActionOptions<T> = {
  onSuccess?: (value: T) => void;
  onError?: (error: unknown) => void;
};

type PendingAction = {
  command: () => Promise<unknown>;
  onSuccess?: (value: unknown) => void;
  onError?: (error: unknown) => void;
};

const IDLE: SudoActionSnapshot = { phase: 'idle', error: null };

/**
 * Sensitive command state machine.
 *
 * The first SUDO_REQUIRED response pauses the command. A successful reauth
 * consumes the saved command exactly once. Errors from that retry are returned
 * to the caller and never start another sudo loop.
 */
export class SudoActionCoordinator {
  private snapshot: SudoActionSnapshot = IDLE;
  private pending: PendingAction | null = null;
  private listeners = new Set<() => void>();

  getSnapshot = (): SudoActionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private setSnapshot(snapshot: SudoActionSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }

  async run<T>(command: () => Promise<T>, options: SudoActionOptions<T> = {}): Promise<boolean> {
    if (this.snapshot.phase !== 'idle') return false;

    this.setSnapshot({ phase: 'command', error: null });
    try {
      const value = await command();
      options.onSuccess?.(value);
      this.setSnapshot(IDLE);
    } catch (error) {
      if (isSudoRequiredError(error)) {
        clearSudo();
        this.pending = {
          command,
          onSuccess: options.onSuccess as ((value: unknown) => void) | undefined,
          onError: options.onError,
        };
        this.setSnapshot({ phase: 'awaiting_password', error: null });
      } else {
        options.onError?.(error);
        this.setSnapshot(IDLE);
      }
    }
    return true;
  }

  cancel(): boolean {
    if (this.snapshot.phase !== 'awaiting_password') return false;
    this.pending = null;
    this.setSnapshot(IDLE);
    return true;
  }

  async submitPassword(
    password: string,
    reauth: (password: string) => Promise<unknown>,
  ): Promise<boolean> {
    if (this.snapshot.phase !== 'awaiting_password' || !this.pending) return false;

    this.setSnapshot({ phase: 'reauth', error: null });
    try {
      await reauth(password);
    } catch (error) {
      this.setSnapshot({ phase: 'awaiting_password', error });
      return false;
    }

    markSudoVerified();
    const action = this.pending;
    this.pending = null;
    this.setSnapshot({ phase: 'retry', error: null });

    try {
      const value = await action.command();
      action.onSuccess?.(value);
    } catch (error) {
      action.onError?.(error);
    } finally {
      this.setSnapshot(IDLE);
    }
    return true;
  }
}
