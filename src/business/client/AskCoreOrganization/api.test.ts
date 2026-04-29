import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bootstrapAskCoreOrganization,
  createAskCoreOrganization,
  createAskCoreOrganizationInvite,
  fetchAskCoreOrganizations,
  setActiveAskCoreOrganization,
  updateAskCoreOrganizationMemberRole,
} from './api';

describe('AskCoreOrganization api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds organization endpoints with same-origin credentials', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchAskCoreOrganizations();
    await bootstrapAskCoreOrganization('token-1');
    await createAskCoreOrganization({ name: 'Seed 的组织' });
    await setActiveAskCoreOrganization('org-1');
    await updateAskCoreOrganizationMemberRole('org-1', 'mem-1', 'admin');
    await createAskCoreOrganizationInvite('org-1', {
      channel: 'qr',
      expiresIn: '7d',
      role: 'member',
    });

    const calls = fetchMock.mock.calls as [RequestInfo | URL, RequestInit?][];

    expect(calls.map(([input]) => String(input))).toEqual([
      '/api/askcore/organizations',
      '/api/askcore/organizations/bootstrap',
      '/api/askcore/organizations',
      '/api/askcore/organizations/active',
      '/api/askcore/organizations/org-1/members/mem-1',
      '/api/askcore/organizations/org-1/invites',
    ]);
    expect(calls[1][1]).toMatchObject({
      body: JSON.stringify({ invite_token: 'token-1' }),
      credentials: 'include',
      method: 'POST',
    });
    expect(calls[4][1]).toMatchObject({
      body: JSON.stringify({ role: 'admin' }),
      method: 'PATCH',
    });
  });
});
