import { ConfigProvider } from '@lobehub/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import * as m from 'motion/react-m';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { WechatMobileLoginStatus } from './WechatMobileLoginStatus';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const renderStatus = (ui: ReactElement) => render(<ConfigProvider motion={m}>{ui}</ConfigProvider>);

describe('WechatMobileLoginStatus', () => {
  it('requires an explicit second click before asking the browser to open WeChat', () => {
    const onOpenWechat = vi.fn();

    renderStatus(
      <WechatMobileLoginStatus
        state={{
          expiresAt: '2026-07-29T12:05:00.000Z',
          phase: 'prepared',
          transactionId: 'wxm_transaction_123',
        }}
        onCancel={vi.fn()}
        onConfirmAccountSwitch={vi.fn()}
        onOpenWechat={onOpenWechat}
        onRetry={vi.fn()}
      />,
    );

    expect(onOpenWechat).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'betterAuth.wechatMobile.openWechat' }));
    expect(onOpenWechat).toHaveBeenCalledOnce();
  });

  it('tells the user to return with system navigation while authorization is pending', () => {
    renderStatus(
      <WechatMobileLoginStatus
        state={{
          expiresAt: '2026-07-29T12:05:00.000Z',
          phase: 'waiting',
          transactionId: 'wxm_transaction_123',
        }}
        onCancel={vi.fn()}
        onConfirmAccountSwitch={vi.fn()}
        onOpenWechat={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText('betterAuth.wechatMobile.returnGuidance')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'betterAuth.wechatMobile.openWechat' }),
    ).not.toBeInTheDocument();
  });

  it('requires a distinct confirmation before replacing another signed-in account', () => {
    const onConfirmAccountSwitch = vi.fn();

    renderStatus(
      <WechatMobileLoginStatus
        state={{ phase: 'account-switch', transactionId: 'wxm_transaction_123' }}
        onCancel={vi.fn()}
        onConfirmAccountSwitch={onConfirmAccountSwitch}
        onOpenWechat={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'betterAuth.wechatMobile.confirmSwitch' }));
    expect(onConfirmAccountSwitch).toHaveBeenCalledOnce();
  });
});
