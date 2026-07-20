import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProtocolIdentityLinkSurface } from './ProtocolIdentityLinkSurface';

const updateOnboarding = vi.hoisted(() => vi.fn());
const refreshUserState = vi.hoisted(() => vi.fn());

vi.mock('@/services/user', () => ({
  userService: { updateOnboarding },
}));
vi.mock('@/store/user', () => ({
  useUserStore: (selector: (state: unknown) => unknown) =>
    selector({ agentOnboarding: undefined, onboarding: undefined, refreshUserState }),
}));

describe('ProtocolIdentityLinkSurface', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.unstubAllGlobals();
    updateOnboarding.mockReset();
    refreshUserState.mockReset();
  });

  it('accepts the one-time token without exposing it after mount', async () => {
    window.history.replaceState(
      null,
      '',
      '/askcore/workbench?protocol=identity-link&token=one-time-secret',
    );
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        account_user_id: 'account-1',
        deployment_id: 7,
        identity_link_id: 9,
        invitation_id: 'invitation-1',
        invitation_status: 'accepted',
        link_status: 'active',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    updateOnboarding.mockResolvedValue({ success: true });
    refreshUserState.mockResolvedValue(undefined);

    render(
      <MemoryRouter
        initialEntries={['/askcore/workbench?protocol=identity-link&token=one-time-secret']}
      >
        <Routes>
          <Route
            element={<ProtocolIdentityLinkSurface invitationToken="one-time-secret" />}
            path="/askcore/workbench"
          />
          <Route element={<div>school landing</div>} path="/school" />
        </Routes>
      </MemoryRouter>,
    );

    expect(window.location.search).toBe('?protocol=identity-link');
    expect(await screen.findByText('school landing')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/askcore/lti/identity-links/accept',
      expect.objectContaining({
        body: JSON.stringify({ invitation_token: 'one-time-secret' }),
        method: 'POST',
      }),
    );
    expect(window.sessionStorage.getItem('askcore.lti.identity-link.invitation')).toBeNull();
    expect(updateOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({ finishedAt: expect.any(String), version: expect.any(Number) }),
    );
    expect(refreshUserState).toHaveBeenCalledTimes(1);
  });

  it('keeps the accepted identity visible when refreshing user state fails', async () => {
    window.history.replaceState(
      null,
      '',
      '/askcore/workbench?protocol=identity-link&token=one-time-secret',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          account_user_id: 'account-1',
          deployment_id: 7,
          identity_link_id: 9,
          invitation_id: 'invitation-1',
          invitation_status: 'accepted',
          link_status: 'active',
        }),
      ),
    );
    updateOnboarding.mockResolvedValue({ success: true });
    refreshUserState.mockRejectedValue(new Error('refresh failed'));

    render(
      <MemoryRouter
        initialEntries={['/askcore/workbench?protocol=identity-link&token=one-time-secret']}
      >
        <Routes>
          <Route
            element={<ProtocolIdentityLinkSurface invitationToken="one-time-secret" />}
            path="/askcore/workbench"
          />
          <Route element={<div>home landing</div>} path="/" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('学校身份已关联')).toBeInTheDocument();
    expect(screen.queryByText('身份关联失败')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '返回首页' }));
    expect(await screen.findByText('home landing')).toBeInTheDocument();
    expect(window.sessionStorage.getItem('askcore.lti.identity-link.invitation')).toBeNull();
  });

  it('fails closed when neither the URL nor the current tab has a token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <ProtocolIdentityLinkSurface />
      </MemoryRouter>,
    );

    expect(await screen.findByText('身份关联失败')).toBeInTheDocument();
    expect(screen.getByText('邀请令牌缺失或已被使用')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  it('shows an actionable message instead of a backend error for an invalid token', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ detail: 'invitation token is invalid' }, { status: 400 }),
        ),
    );

    render(
      <MemoryRouter>
        <ProtocolIdentityLinkSurface invitationToken="invalid-token" />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText('邀请链接无效、已过期或已被使用，请联系学校管理员重新发送'),
    ).toBeInTheDocument();
    expect(screen.queryByText('invitation token is invalid')).not.toBeInTheDocument();
  });
});
