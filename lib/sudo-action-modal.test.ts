import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SudoActionModal } from '@/components/ui/SudoActionModal';

describe('SudoActionModal', () => {
  it('현재 비밀번호 입력과 production 안내 문구를 공용 ModalShell로 렌더링한다', () => {
    const html = renderToStaticMarkup(createElement(SudoActionModal, {
      pending: false,
      error: null,
      onClose: vi.fn(),
      onSubmit: vi.fn(),
    }));

    expect(html).toContain('role="dialog"');
    expect(html).toContain('본인 확인');
    expect(html).toContain('보호된 작업을 계속하려면 현재 비밀번호를 입력해 주세요.');
    expect(html).toContain('type="password"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('확인하고 계속');
    expect(html).not.toContain('개발');
  });

  it('재인증 중에는 입력과 버튼을 비활성화하고 서버 오류를 노출한다', () => {
    const html = renderToStaticMarkup(createElement(SudoActionModal, {
      pending: true,
      error: { response: { data: { message: '비밀번호가 올바르지 않습니다.' } } },
      onClose: vi.fn(),
      onSubmit: vi.fn(),
    }));

    expect(html).toContain('비밀번호가 올바르지 않습니다.');
    expect(html).toContain('role="alert"');
    expect(html).toContain('확인 중...');
    expect(html).toContain('disabled=""');
  });
});
