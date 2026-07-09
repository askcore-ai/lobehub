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
  bootstrapOrganizationForSession: vi.fn(
    async (): Promise<Record<string, unknown> | undefined> => undefined,
  ),
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
    (globalThis as Record<string, unknown>).__ASKCORE_WORKBENCH_ROUTE_BOOTSTRAP_ORGANIZATION__ =
      askCoreOrganizationMock.bootstrapOrganizationForSession;
    (globalThis as Record<string, unknown>).__ASKCORE_WORKBENCH_ROUTE_PERSISTED_ACTIVE_ORG_ID__ =
      askCoreOrganizationMock.persistedActiveOrganizationIdFromSession;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>).__ASKCORE_WORKBENCH_ROUTE_AUTH__;
    delete (globalThis as Record<string, unknown>)
      .__ASKCORE_WORKBENCH_ROUTE_BOOTSTRAP_ORGANIZATION__;
    delete (globalThis as Record<string, unknown>)
      .__ASKCORE_WORKBENCH_ROUTE_PERSISTED_ACTIVE_ORG_ID__;
    askCoreOrganizationMock.bootstrapOrganizationForSession.mockResolvedValue(undefined);
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

  it('rejects cross-origin workbench writes before session lookup', async () => {
    const { POST } = await loadRoute();

    const response = await POST(
      new NextRequest(
        'https://askcore.cn/api/askcore/workbench/actions/submission.report.generate',
        {
          body: JSON.stringify({ params: {} }),
          headers: { origin: 'https://evil.example' },
          method: 'POST',
        },
      ),
      routeContext(['actions', 'submission.report.generate']),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      detail: 'Cross-origin workbench writes are not allowed',
    });
    expect(authApi.getSession).not.toHaveBeenCalled();
  });

  it('rejects workbench writes with spoofed forwarded host origin', async () => {
    const { POST } = await loadRoute();

    const response = await POST(
      new NextRequest(
        'https://askcore.cn/api/askcore/workbench/actions/submission.report.generate',
        {
          body: JSON.stringify({ params: {} }),
          headers: {
            'origin': 'https://evil.example',
            'x-forwarded-host': 'evil.example',
            'x-forwarded-proto': 'https',
          },
          method: 'POST',
        },
      ),
      routeContext(['actions', 'submission.report.generate']),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      detail: 'Cross-origin workbench writes are not allowed',
    });
    expect(authApi.getSession).not.toHaveBeenCalled();
  });

  it('rejects browser cross-site writes even when Origin is omitted', async () => {
    const { POST } = await loadRoute();

    const response = await POST(
      new NextRequest(
        'https://askcore.cn/api/askcore/workbench/actions/submission.report.generate',
        {
          body: JSON.stringify({ params: {} }),
          headers: { 'sec-fetch-site': 'cross-site' },
          method: 'POST',
        },
      ),
      routeContext(['actions', 'submission.report.generate']),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      detail: 'Cross-origin workbench writes are not allowed',
    });
    expect(authApi.getSession).not.toHaveBeenCalled();
  });

  it('rejects invalid workbench route segments before session lookup', async () => {
    const { GET } = await loadRoute();

    const response = await GET(
      new NextRequest(
        'https://askcore.cn/api/askcore/workbench/actions/submission.report.generate',
      ),
      routeContext(['actions', 'submission.report.generate\n']),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      detail: 'Invalid AskCore route segment',
    });
    expect(authApi.getSession).not.toHaveBeenCalled();
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

  it('injects Better Auth member summaries into organization directory responses', async () => {
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'test-lobehub-workbench');
    vi.stubEnv('AITUTOR_API_BASE_URL', 'http://api:8000');
    authApi.getSession.mockResolvedValue({
      session: { activeOrganizationId: 'org-1' },
      user: { email: 'owner@askcore.cn', id: 'user-owner' },
    } as any);
    authApi.getFullOrganization.mockResolvedValue({
      id: 'org-1',
      members: [
        {
          id: 'mem-owner',
          role: 'owner',
          user: { email: 'owner@askcore.cn', id: 'user-owner', name: '张扬' },
          userId: 'user-owner',
        },
      ],
      name: '试点区',
    });
    const { GET } = await loadRoute();

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          member_summaries: {},
          org_id: 'org-1',
          person_profiles: [
            {
              account: {
                email: null,
                member_id: null,
                name: '张扬',
                organization_role: null,
                phone: null,
                user_id: 'user-owner',
              },
              education: { roles: [], status: 'unassigned' },
              invitation: { pending_directed_count: 0, pending_open_count: 0, statuses: [] },
              person: {
                display_name: '张扬',
                id: 574,
                lifecycle_status: 'active',
                org_id: 'org-1',
                primary_org_unit_id: null,
                source: 'membership_backfill',
              },
            },
          ],
          people: [
            {
              better_auth_user_id: 'user-owner',
              display_name: '张扬',
              id: 574,
              lifecycle_status: 'active',
              org_id: 'org-1',
              primary_org_unit_id: null,
              registration_status: 'registered',
            },
          ],
          role_assignments: [],
          roster_links: [],
          units: [],
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/workbench/organization/directory', {
        headers: { Cookie: 'better-auth.session=test-session' },
      }),
      routeContext(['organization', 'directory']),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      member_summaries: {
        'user-owner': {
          email: 'owner@askcore.cn',
          member_id: 'mem-owner',
          name: '张扬',
          organization_role: 'owner',
        },
      },
      person_profiles: [
        {
          account: {
            email: 'owner@askcore.cn',
            member_id: 'mem-owner',
            name: '张扬',
            organization_role: 'owner',
            user_id: 'user-owner',
          },
        },
      ],
    });
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect((init.headers as Headers).get('Cookie')).toBeNull();
  });

  it('allows the public AskCore origin when the internal workbench origin is a bind address', async () => {
    vi.stubEnv('APP_URL', 'http://0.0.0.0:3210');
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
    const { POST } = await loadRoute();

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest(
      'http://0.0.0.0:3210/api/askcore/workbench/actions/submission.report.generate',
      {
        body: JSON.stringify({ params: { submission_id: 12 } }),
        headers: { 'content-type': 'application/json', 'origin': 'https://askcore.cn' },
        method: 'POST',
      },
    );
    const arrayBufferSpy = vi.spyOn(request, 'arrayBuffer');

    const response = await POST(request, routeContext(['actions', 'submission.report.generate']));

    expect(response.status).toBe(200);
    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit & { duplex?: string }];
    expect(init.body).toBe(request.body);
    expect(init.duplex).toBe('half');
    expect((init.headers as Headers).get('content-type')).toBe('application/json');
  });

  it('maps first-party action, invocation, and artifact routes to plugin authority paths', async () => {
    const { buildWorkbenchAuthorityUrl } = await loadRoute();
    const request = new NextRequest(
      'https://askcore.cn/api/askcore/workbench/actions/submission.report.generate',
    );

    expect(
      buildWorkbenchAuthorityUrl(request, ['actions', 'submission.report.generate']).toString(),
    ).toBe('http://api:8000/api/lobe/plugins/v1/aitutor-suite/actions/submission.report.generate');
    expect(
      buildWorkbenchAuthorityUrl(request, ['invocations', 'inv-1', 'artifacts']).toString(),
    ).toBe('http://api:8000/api/lobe/plugins/v1/invocations/inv-1/artifacts');
    expect(buildWorkbenchAuthorityUrl(request, ['artifacts', 'artifact-1']).toString()).toBe(
      'http://api:8000/api/lobe/plugins/v1/artifacts/artifact-1',
    );
    expect(
      buildWorkbenchAuthorityUrl(request, ['submissions', 'reports', 'download']).toString(),
    ).toBe('http://api:8000/api/lobe/plugins/v1/aitutor-suite/ui/submissions/reports/download');
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

  it('derives organization role from nested Better Auth member user payloads', async () => {
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'test-lobehub-workbench');
    vi.stubEnv('AITUTOR_API_BASE_URL', 'http://api:8000');
    authApi.getSession.mockResolvedValue({
      session: { activeOrganizationId: 'org-1' },
      user: { email: 'admin@askcore.cn', id: 'user-1' },
    } as any);
    authApi.getFullOrganization.mockResolvedValue({
      id: 'org-1',
      members: [{ role: 'admin', user: { id: 'user-1' } }],
      name: 'AskCore School',
    });
    const { GET } = await loadRoute();

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
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
    expect(payload.organization_role).toBe('admin');
  });

  it('bootstraps an organization for device agent link callbacks without an active organization', async () => {
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'test-lobehub-workbench');
    vi.stubEnv('AITUTOR_API_BASE_URL', 'http://api:8000');
    const session = {
      session: {},
      user: { email: 'teacher@askcore.cn', id: 'user-1' },
    } as any;
    authApi.getSession.mockResolvedValue(session);
    authApi.listOrganizations.mockResolvedValue([
      { id: 'org-1', name: 'First School' },
      { id: 'org-2', name: 'Second School' },
    ]);
    askCoreOrganizationMock.bootstrapOrganizationForSession.mockResolvedValue({
      id: 'org-2',
      members: [{ role: 'admin', userId: 'user-1' }],
      name: 'Second School',
    });
    const { GET } = await loadRoute();

    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<html>linked</html>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new NextRequest(
        'https://askcore.cn/api/askcore/workbench/device-agent/link/start?session_id=dals_1',
      ),
      routeContext(['device-agent', 'link', 'start']),
    );

    expect(response.status).toBe(200);
    expect(askCoreOrganizationMock.bootstrapOrganizationForSession).toHaveBeenCalledWith(session);

    const [target, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(target.toString()).toBe(
      'http://api:8000/api/lobe/plugins/v1/aitutor-suite/ui/device-agent/link/start?session_id=dals_1',
    );

    const assertion = (init.headers as Headers).get('X-AskCore-Billing-Assertion');
    const { payload } = await jwtVerify(
      assertion!,
      new TextEncoder().encode('test-lobehub-workbench'),
      {
        audience: 'aitutor-billing',
        issuer: 'askcore-lobehub',
      },
    );
    expect(payload.active_org_id).toBe('org-2');
    expect(payload.active_org_name).toBe('Second School');
    expect(payload.organization_role).toBe('admin');
  });
});
