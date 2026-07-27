import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSudo, isSudoValid } from './sudo';
import { SudoActionCoordinator } from './sudo-action';

const sudoRequired = () => ({
  response: { status: 403, data: { code: 'SUDO_REQUIRED' } },
});

const forbidden = () => ({
  response: { status: 403, data: { code: 'FORBIDDEN' } },
});

describe('SudoActionCoordinator', () => {
  beforeEach(() => clearSudo());

  it('일반 command는 한 번 실행하고 바로 성공한다', async () => {
    const coordinator = new SudoActionCoordinator();
    const command = vi.fn().mockResolvedValue('ok');
    const onSuccess = vi.fn();

    expect(await coordinator.run(command, { onSuccess })).toBe(true);

    expect(command).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith('ok');
    expect(coordinator.getSnapshot().phase).toBe('idle');
  });

  it('SUDO_REQUIRED만 재인증 후 원 command를 정확히 한 번 재시도한다', async () => {
    const coordinator = new SudoActionCoordinator();
    const command = vi.fn()
      .mockRejectedValueOnce(sudoRequired())
      .mockResolvedValueOnce('saved');
    const reauth = vi.fn().mockResolvedValue({ ok: true });
    const onSuccess = vi.fn();

    await coordinator.run(command, { onSuccess });
    expect(coordinator.getSnapshot().phase).toBe('awaiting_password');

    expect(await coordinator.submitPassword('password', reauth)).toBe(true);

    expect(reauth).toHaveBeenCalledTimes(1);
    expect(command).toHaveBeenCalledTimes(2);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith('saved');
    expect(isSudoValid()).toBe(true);
    expect(coordinator.getSnapshot().phase).toBe('idle');
  });

  it('취소하면 보관 command를 버리고 재시도하지 않는다', async () => {
    const coordinator = new SudoActionCoordinator();
    const command = vi.fn().mockRejectedValue(sudoRequired());
    const reauth = vi.fn().mockResolvedValue({ ok: true });

    await coordinator.run(command);
    expect(coordinator.cancel()).toBe(true);
    expect(await coordinator.submitPassword('password', reauth)).toBe(false);

    expect(command).toHaveBeenCalledTimes(1);
    expect(reauth).not.toHaveBeenCalled();
    expect(coordinator.getSnapshot().phase).toBe('idle');
  });

  it('재인증 실패 시 command를 재시도하지 않고 비밀번호 입력 상태를 유지한다', async () => {
    const coordinator = new SudoActionCoordinator();
    const command = vi.fn().mockRejectedValueOnce(sudoRequired());
    const reauthError = { response: { status: 401, data: { message: '비밀번호가 올바르지 않습니다.' } } };
    const reauth = vi.fn().mockRejectedValue(reauthError);

    await coordinator.run(command);
    expect(await coordinator.submitPassword('wrong', reauth)).toBe(false);

    expect(command).toHaveBeenCalledTimes(1);
    expect(coordinator.getSnapshot()).toEqual({
      phase: 'awaiting_password',
      error: reauthError,
    });
  });

  it('진행 중 중복 클릭과 중복 비밀번호 제출을 거부한다', async () => {
    const coordinator = new SudoActionCoordinator();
    let rejectFirst: (error: unknown) => void = () => undefined;
    const first = new Promise<never>((_resolve, reject) => { rejectFirst = reject; });
    const command = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce('retried');

    const running = coordinator.run(command);
    expect(await coordinator.run(command)).toBe(false);
    rejectFirst(sudoRequired());
    await running;

    let resolveReauth: (value: unknown) => void = () => undefined;
    const reauth = vi.fn(() => new Promise((resolve) => { resolveReauth = resolve; }));
    const submitting = coordinator.submitPassword('password', reauth);
    expect(await coordinator.submitPassword('password', reauth)).toBe(false);
    resolveReauth({ ok: true });
    await submitting;

    expect(reauth).toHaveBeenCalledTimes(1);
    expect(command).toHaveBeenCalledTimes(2);
  });

  it('일반 403은 모달이나 재시도 없이 기존 오류 처리기로 보낸다', async () => {
    const coordinator = new SudoActionCoordinator();
    const error = forbidden();
    const command = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();

    await coordinator.run(command, { onError });

    expect(command).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
    expect(coordinator.getSnapshot().phase).toBe('idle');
  });

  it('재시도 command가 다시 SUDO_REQUIRED여도 sudo 루프를 열지 않는다', async () => {
    const coordinator = new SudoActionCoordinator();
    const retryError = sudoRequired();
    const command = vi.fn()
      .mockRejectedValueOnce(sudoRequired())
      .mockRejectedValueOnce(retryError);
    const onError = vi.fn();

    await coordinator.run(command, { onError });
    await coordinator.submitPassword('password', vi.fn().mockResolvedValue({ ok: true }));

    expect(command).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(retryError);
    expect(coordinator.getSnapshot().phase).toBe('idle');
  });
});
