import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WechatRebindPage from './page';

const mocks = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  router: { replace: vi.fn() },
  search: new Map<string, string>(),
  searchParams: { get: vi.fn() },
  sessionResult: {
    data: { session: { id: 'session-1' }, user: { id: 'user-1' } },
    isPending: false,
  },
}));

vi.mock('@lobehub/ui', () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  Flexbox: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/features/AuthCard', () => ({
  default: ({
    children,
    subtitle,
    title,
  }: {
    children: ReactNode;
    subtitle: ReactNode;
    title: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {children}
    </main>
  ),
}));

vi.mock('@/libs/better-auth/auth-client', () => ({
  listAccounts: mocks.listAccounts,
  useSession: () => mocks.sessionResult,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('WechatRebindPage', () => {
  beforeEach(() => {
    mocks.listAccounts.mockResolvedValue({
      data: [{ id: 'legacy-account-1', providerId: 'wechat' }],
    });
    mocks.router.replace.mockReset();
    mocks.search.clear();
    mocks.searchParams.get.mockImplementation((key: string) => mocks.search.get(key) || null);
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prepares proof first and does not mutate the account from the initial action', async () => {
    vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(5);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    );
    vi.mocked(fetch).mockResolvedValueOnce({
      json: async () => ({
        expiresAt: '2026-07-29T12:05:00.000Z',
        openTarget: 'weixin://dl/business/?redacted=1',
        pollAfterMs: 1200,
        tabBinding: 'a'.repeat(43),
        transactionId: 'wxm_transaction_1234',
      }),
      ok: true,
    } as Response);

    render(<WechatRebindPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'betterAuth.wechatRebind.start' }));

    expect(
      await screen.findByRole('button', { name: 'betterAuth.wechatRebind.openWechat' }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/wechat-rebind/start',
      expect.objectContaining({
        body: expect.stringContaining('"legacyAccountRowId":"legacy-account-1"'),
      }),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('requires a second explicit confirmation after the provider proof', async () => {
    mocks.search.set('transactionId', 'wxm_transaction_123');
    sessionStorage.setItem('askcore:wechat-mobile:tab:wxm_transaction_123', 'tab-binding');
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        json: async () => ({ state: 'authorized' }),
        ok: true,
      } as Response)
      .mockResolvedValueOnce({
        json: async () => ({ state: 'verified' }),
        ok: true,
      } as Response);

    render(<WechatRebindPage />);
    const confirm = await screen.findByRole('button', {
      name: 'betterAuth.wechatRebind.confirm',
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    fireEvent.click(confirm);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/auth/wechat-rebind/confirm',
      expect.objectContaining({
        body: JSON.stringify({ transactionId: 'wxm_transaction_123' }),
      }),
    );
    expect(await screen.findByText('betterAuth.wechatRebind.verified')).toBeInTheDocument();
  });

  it('offers retry after a malformed provider response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      json: async () => ({ code: 'WECHAT_PROVIDER_MALFORMED' }),
      ok: false,
      status: 502,
    } as Response);

    render(<WechatRebindPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'betterAuth.wechatRebind.start' }));

    expect(
      await screen.findByRole('button', { name: 'betterAuth.wechatRebind.retry' }),
    ).toBeInTheDocument();
  });
});
