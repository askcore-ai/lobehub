import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProtocolIdentityLinkSurface } from './ProtocolIdentityLinkSurface';

describe('ProtocolIdentityLinkSurface', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.unstubAllGlobals();
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

    render(
      <MemoryRouter>
        <ProtocolIdentityLinkSurface invitationToken="one-time-secret" />
      </MemoryRouter>,
    );

    expect(window.location.search).toBe('?protocol=identity-link');
    expect(await screen.findByText('学校身份已关联')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/askcore/lti/identity-links/accept',
      expect.objectContaining({
        body: JSON.stringify({ invitation_token: 'one-time-secret' }),
        method: 'POST',
      }),
    );
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
