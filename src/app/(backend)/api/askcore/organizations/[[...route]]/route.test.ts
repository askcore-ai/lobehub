// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMock = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  createInvite: vi.fn(),
  createOrganization: vi.fn(),
  list: vi.fn(),
  listMembers: vi.fn(),
  removeMember: vi.fn(),
  setActive: vi.fn(),
  updateMemberRole: vi.fn(),
  updateOrganization: vi.fn(),
}));

const authApi = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock('@/auth', () => ({
  auth: {
    api: authApi,
  },
}));

vi.mock('@/server/services/askcoreOrganization', () => {
  class AskCoreOrganizationError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  return {
    AskCoreOrganizationError,
    AskCoreOrganizationService: vi.fn(() => serviceMock),
  };
});

const routeContext = (route: string[] = []) => ({
  params: Promise.resolve({ route }),
});

const loadRoute = () => import('./route');

describe('AskCore organization route', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__ASKCORE_ORGANIZATION_ROUTE_AUTH__ = {
      api: authApi,
    };
    (globalThis as Record<string, unknown>).__ASKCORE_ORGANIZATION_ROUTE_SERVICE__ = serviceMock;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    delete (globalThis as Record<string, unknown>).__ASKCORE_ORGANIZATION_ROUTE_AUTH__;
    delete (globalThis as Record<string, unknown>).__ASKCORE_ORGANIZATION_ROUTE_SERVICE__;
  });

  it('requires a LobeHub session', async () => {
    authApi.getSession.mockResolvedValue(null);
    const { GET } = await loadRoute();

    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/organizations'),
      routeContext(),
    );

    expect(response.status).toBe(401);
  });

  it('rejects browser cross-site organization writes when Origin is omitted', async () => {
    const { POST } = await loadRoute();

    const response = await POST(
      new NextRequest('https://askcore.cn/api/askcore/organizations/bootstrap', {
        body: JSON.stringify({}),
        headers: { 'sec-fetch-site': 'cross-site' },
        method: 'POST',
      }),
      routeContext(['bootstrap']),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      detail: 'Cross-origin organization writes are not allowed',
    });
    expect(authApi.getSession).not.toHaveBeenCalled();
  });

  it('rejects invalid organization route segments before session lookup', async () => {
    const { GET } = await loadRoute();

    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/organizations/org%0A1'),
      routeContext(['org\n1']),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      detail: 'Invalid AskCore route segment',
    });
    expect(authApi.getSession).not.toHaveBeenCalled();
  });

  it('bootstraps with an invite token', async () => {
    authApi.getSession.mockResolvedValue({ session: { id: 'session-1' }, user: { id: 'user-1' } });
    serviceMock.bootstrap.mockResolvedValue({ current: { id: 'org-1' } });
    const { POST } = await loadRoute();

    const response = await POST(
      new NextRequest('https://askcore.cn/api/askcore/organizations/bootstrap', {
        body: JSON.stringify({ invite_token: 'invite-token' }),
        method: 'POST',
      }),
      routeContext(['bootstrap']),
    );

    expect(response.status).toBe(200);
    expect(serviceMock.bootstrap).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: 'user-1' } }),
      'invite-token',
    );
  });

  it('routes member role updates to the active organization service', async () => {
    authApi.getSession.mockResolvedValue({ session: { id: 'session-1' }, user: { id: 'user-1' } });
    serviceMock.updateMemberRole.mockResolvedValue([]);
    const { PATCH } = await loadRoute();

    const response = await PATCH(
      new NextRequest('https://askcore.cn/api/askcore/organizations/org-1/members/mem-1', {
        body: JSON.stringify({ role: 'admin' }),
        method: 'PATCH',
      }),
      routeContext(['org-1', 'members', 'mem-1']),
    );

    expect(response.status).toBe(200);
    expect(serviceMock.updateMemberRole).toHaveBeenCalledWith(
      expect.any(Object),
      'org-1',
      'mem-1',
      'admin',
    );
  });

  it('routes member removal to the active organization service', async () => {
    authApi.getSession.mockResolvedValue({ session: { id: 'session-1' }, user: { id: 'user-1' } });
    serviceMock.removeMember.mockResolvedValue([]);
    const { DELETE } = await loadRoute();

    const response = await DELETE(
      new NextRequest('https://askcore.cn/api/askcore/organizations/org-1/members/mem-1', {
        method: 'DELETE',
      }),
      routeContext(['org-1', 'members', 'mem-1']),
    );

    expect(response.status).toBe(200);
    expect(serviceMock.removeMember).toHaveBeenCalledWith(expect.any(Object), 'org-1', 'mem-1');
  });

  it('creates link, QR, and email invitations through the same endpoint', async () => {
    authApi.getSession.mockResolvedValue({ session: { id: 'session-1' }, user: { id: 'user-1' } });
    serviceMock.createInvite.mockResolvedValue({ link: 'https://askcore.cn/join/organization/t' });
    const { POST } = await loadRoute();

    const response = await POST(
      new NextRequest('https://askcore.cn/api/askcore/organizations/org-1/invites', {
        body: JSON.stringify({ channel: 'qr', expiresIn: '7d', role: 'member' }),
        method: 'POST',
      }),
      routeContext(['org-1', 'invites']),
    );

    expect(response.status).toBe(200);
    expect(serviceMock.createInvite).toHaveBeenCalledWith(
      expect.any(Object),
      'org-1',
      expect.objectContaining({ channel: 'qr', expiresIn: '7d' }),
    );
  });

  it('rejects oversized organization write bodies before dispatching to the service', async () => {
    authApi.getSession.mockResolvedValue({ session: { id: 'session-1' }, user: { id: 'user-1' } });
    serviceMock.setActive.mockResolvedValue({ current: { id: 'org-1' } });
    const { POST } = await loadRoute();

    const response = await POST(
      new NextRequest('https://askcore.cn/api/askcore/organizations/active', {
        body: JSON.stringify({ organization_id: 'org-1', padding: 'x'.repeat(70 * 1024) }),
        method: 'POST',
      }),
      routeContext(['active']),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      detail: 'Organization request body exceeds 65536 bytes',
    });
    expect(serviceMock.setActive).not.toHaveBeenCalled();
  });

  it('uses the public proxy origin for invite link generation', async () => {
    authApi.getSession.mockResolvedValue({ session: { id: 'session-1' }, user: { id: 'user-1' } });
    serviceMock.createInvite.mockResolvedValue({ link: 'https://askcore.cn/join/organization/t' });
    vi.stubEnv('APP_URL', 'http://0.0.0.0:3210');
    const serviceFactory = vi.fn(() => serviceMock);
    (globalThis as Record<string, unknown>).__ASKCORE_ORGANIZATION_ROUTE_SERVICE__ = serviceFactory;
    const { POST } = await loadRoute();

    const response = await POST(
      new NextRequest('http://0.0.0.0:3210/api/askcore/organizations/org-1/invites', {
        body: JSON.stringify({ channel: 'link', expiresIn: '7d', role: 'member' }),
        headers: {
          'x-forwarded-host': 'askcore.cn',
          'x-forwarded-proto': 'https',
        },
        method: 'POST',
      }),
      routeContext(['org-1', 'invites']),
    );

    expect(response.status).toBe(200);
    expect(serviceFactory).toHaveBeenCalledWith('https://askcore.cn');
  });

  it('allows the public AskCore origin when the internal request origin is a bind address', async () => {
    authApi.getSession.mockResolvedValue({ session: { id: 'session-1' }, user: { id: 'user-1' } });
    serviceMock.createInvite.mockResolvedValue({ link: 'https://askcore.cn/join/organization/t' });
    vi.stubEnv('APP_URL', 'http://0.0.0.0:3210');
    const serviceFactory = vi.fn(() => serviceMock);
    (globalThis as Record<string, unknown>).__ASKCORE_ORGANIZATION_ROUTE_SERVICE__ = serviceFactory;
    const { POST } = await loadRoute();

    const response = await POST(
      new NextRequest('http://0.0.0.0:3210/api/askcore/organizations/org-1/invites', {
        body: JSON.stringify({ channel: 'link', expiresIn: '7d', role: 'member' }),
        headers: { origin: 'https://askcore.cn' },
        method: 'POST',
      }),
      routeContext(['org-1', 'invites']),
    );

    expect(response.status).toBe(200);
    expect(serviceFactory).toHaveBeenCalledWith('https://askcore.cn');
  });
});
