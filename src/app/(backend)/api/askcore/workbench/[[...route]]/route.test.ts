// @vitest-environment node
import { jwtVerify } from 'jose';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authApi = vi.hoisted(() => ({
  getFullOrganization: vi.fn(),
  getSession: vi.fn(),
  listOrganizations: vi.fn(),
}));

vi.mock('@/auth', () => ({
  auth: {
    api: authApi,
  },
}));

const askCoreOrganizationMock = vi.hoisted(() => ({
  persistedActiveOrganizationIdFromSession: vi.fn(async () => undefined),
}));

vi.mock('@/server/services/askcoreOrganization', () => ({
  persistedActiveOrganizationIdFromSession:
    askCoreOrganizationMock.persistedActiveOrganizationIdFromSession,
}));

const routeContext = (route: string[] = ['dashboard']) => ({
  params: Promise.resolve({ route }),
});

const loadRoute = () => import('./route');

describe('AskCore workbench proxy route', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__ASKCORE_WORKBENCH_ROUTE_AUTH__ = {
      api: authApi,
    };
    (globalThis as Record<string, unknown>).__ASKCORE_WORKBENCH_ROUTE_PERSISTED_ACTIVE_ORG_ID__ =
      askCoreOrganizationMock.persistedActiveOrganizationIdFromSession;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>).__ASKCORE_WORKBENCH_ROUTE_AUTH__;
    delete (globalThis as Record<string, unknown>).__ASKCORE_WORKBENCH_ROUTE_PERSISTED_ACTIVE_ORG_ID__;
    askCoreOrganizationMock.persistedActiveOrganizationIdFromSession.mockResolvedValue(undefined);
  });

  it('returns 401 when the LobeHub session is missing', async () => {
    authApi.getSession.mockResolvedValue(null);
    const { GET } = await loadRoute();

    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/workbench/dashboard'),
      routeContext(),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      detail: 'LobeHub session is required for workbench',
    });
  });

  it('signs a server assertion and forwards valid sessions to FastAPI', async () => {
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'test-lobehub-workbench');
    vi.stubEnv('AITUTOR_API_BASE_URL', 'http://api:8000');
    authApi.getSession.mockResolvedValue({
      session: { activeOrganizationId: 'org-1' },
      user: { email: 'teacher@askcore.cn', id: 'user-1' },
    } as any);
    authApi.getFullOrganization.mockResolvedValue({
      id: 'org-1',
      members: [{ role: 'owner', userId: 'user-1' }],
      name: 'AskCore School',
    });
    const { GET } = await loadRoute();

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ counts: { schools: 1 } }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/workbench/schools?page=1', {
        headers: {
          Authorization: 'Bearer browser-token',
          Cookie: 'better-auth.session=test-session',
        },
      }),
      routeContext(['schools']),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ counts: { schools: 1 } });
    expect(authApi.getFullOrganization).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      query: { membersLimit: 100, organizationId: 'org-1' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [target, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(target.toString()).toBe(
      'http://api:8000/api/lobe/plugins/v1/aitutor-suite/ui/schools?page=1',
    );
    expect(init.method).toBe('GET');

    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBeNull();
    expect(headers.get('Cookie')).toBeNull();

    const assertion = headers.get('X-AskCore-Billing-Assertion');
    expect(assertion).toBeTruthy();

    const { payload } = await jwtVerify(
      assertion!,
      new TextEncoder().encode('test-lobehub-workbench'),
      {
        audience: 'aitutor-billing',
        issuer: 'askcore-lobehub',
      },
    );
    expect(payload.sub).toBe('user-1');
    expect(payload.email).toBe('teacher@askcore.cn');
    expect(payload.active_org_id).toBe('org-1');
    expect(payload.active_org_name).toBe('AskCore School');
    expect(payload.organization_role).toBe('owner');
    expect(payload.scopes).toEqual(['plugin.invoke', 'plugin.read']);
  });

  it('falls back to the only organization when the session has no active organization', async () => {
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'test-lobehub-workbench');
    vi.stubEnv('AITUTOR_API_BASE_URL', 'http://api:8000');
    authApi.getSession.mockResolvedValue({
      session: {},
      user: { email: 'teacher@askcore.cn', id: 'user-1' },
    } as any);
    authApi.listOrganizations.mockResolvedValue([{ id: 'org-1', name: 'AskCore School' }]);
    authApi.getFullOrganization.mockResolvedValue({
      id: 'org-1',
      members: [{ role: 'owner', userId: 'user-1' }],
      name: 'AskCore School',
    });
    const { GET } = await loadRoute();

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ counts: { schools: 1 } }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/workbench/dashboard'),
      routeContext(),
    );

    expect(response.status).toBe(200);
    expect(authApi.listOrganizations).toHaveBeenCalledWith({ headers: expect.any(Headers) });
    expect(authApi.getFullOrganization).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      query: { membersLimit: 100, organizationId: 'org-1' },
    });

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const assertion = (init.headers as Headers).get('X-AskCore-Billing-Assertion');
    const { payload } = await jwtVerify(
      assertion!,
      new TextEncoder().encode('test-lobehub-workbench'),
      {
        audience: 'aitutor-billing',
        issuer: 'askcore-lobehub',
      },
    );
    expect(payload.active_org_id).toBe('org-1');
    expect(payload.organization_role).toBe('owner');
  });
});
