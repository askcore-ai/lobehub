// @vitest-environment happy-dom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Login from './Login';

const useSession = vi.fn();

vi.mock('@lobehub/ui', () => ({
  Avatar: () => <span>avatar</span>,
  Block: ({ children }: any) => <div>{children}</div>,
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Flexbox: ({ children }: any) => <div>{children}</div>,
  Skeleton: { Avatar: () => <span />, Button: () => <span /> },
  Text: ({ children }: any) => <span>{children}</span>,
}));

vi.mock('antd', () => ({ Result: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/components/Loading/BrandTextLoading', () => ({ default: () => <span>loading</span> }));
vi.mock('@/features/AuthCard', () => ({
  default: ({ children, footer }: any) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));
vi.mock('@/libs/better-auth/auth-client', () => ({ useSession: () => useSession() }));
vi.mock('./components/OAuthApplicationLogo', () => ({ default: () => <span>logo</span> }));

describe('school OIDC login confirmation', () => {
  const requestSubmit = vi.fn();

  beforeEach(() => {
    requestSubmit.mockReset();
    vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(requestSubmit);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('auto-submits after a valid Better Auth session is ready', async () => {
    useSession.mockReturnValue({
      data: { user: { image: '', name: 'Student' } },
      isPending: false,
    });

    render(
      <Login
        autoSubmit
        clientMetadata={{ clientName: 'AskCore 学校' }}
        uid="interaction-login-123"
      />,
    );

    await waitFor(() => expect(requestSubmit).toHaveBeenCalledTimes(1));
    expect(document.querySelector('input[name="uid"]')?.getAttribute('value')).toBe(
      'interaction-login-123',
    );
  });

  it('does not auto-submit for an explicit third-party confirmation', async () => {
    useSession.mockReturnValue({
      data: { user: { image: '', name: 'Student' } },
      isPending: false,
    });

    render(<Login clientMetadata={{ clientName: 'Third Party' }} uid="interaction-login-456" />);

    await Promise.resolve();
    expect(requestSubmit).not.toHaveBeenCalled();
  });

  it('does not submit without a Better Auth session', async () => {
    useSession.mockReturnValue({ data: null, isPending: false });

    render(
      <Login
        autoSubmit
        clientMetadata={{ clientName: 'AskCore 学校' }}
        uid="interaction-login-789"
      />,
    );

    await Promise.resolve();
    expect(requestSubmit).not.toHaveBeenCalled();
  });
});
