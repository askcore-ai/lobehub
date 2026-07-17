// @vitest-environment node
import { jwtVerify } from 'jose';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authApi = vi.hoisted(() => ({
  getFullOrganization: vi.fn(),
  getSession: vi.fn(),
  listOrganizations: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: { api: authApi } }));

const routeContext = (route: string[]) => ({ params: Promise.resolve({ route }) });
const loadRoute = () => import('./route');
const token = 'a'.repeat(80);

describe('AskCore school portal proxy', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__ASKCORE_WORKBENCH_ROUTE_AUTH__ = { api: authApi };
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>).__ASKCORE_WORKBENCH_ROUTE_AUTH__;
  });

  it('requires a Better Auth session and does not inspect organizations', async () => {
    authApi.getSession.mockResolvedValue(null);
    const { GET } = await loadRoute();

    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/school/portal'),
      routeContext(['portal']),
    );

    expect(response.status).toBe(401);
    expect(authApi.getFullOrganization).not.toHaveBeenCalled();
    expect(authApi.listOrganizations).not.toHaveBeenCalled();
  });

  it('forwards a personal assertion without cookies or organization lookup', async () => {
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'school-portal-secret');
    authApi.getSession.mockResolvedValue({
      user: { email: 'student@askcore.cn', id: 'user-1', role: 'user' },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        can_manage_integrations: false,
        contract: 'askcore.school-portal.v1',
        schools: [],
        selection_required: false,
        show_school_entry: false,
        state: 'unlinked',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await loadRoute();

    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/school/portal', {
        headers: { cookie: 'better-auth.session=private' },
      }),
      routeContext(['portal']),
    );

    expect(response.status).toBe(200);
    expect(authApi.getFullOrganization).not.toHaveBeenCalled();
    const [target, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(target.toString()).toBe('http://api:8000/api/school/v1/portal');
    const headers = new Headers(init.headers);
    expect(headers.has('cookie')).toBe(false);
    const assertion = headers.get('X-AskCore-Billing-Assertion');
    expect(assertion).toBeTruthy();
    const { payload } = await jwtVerify(
      assertion!,
      new TextEncoder().encode('school-portal-secret'),
      { audience: 'aitutor-billing', issuer: 'askcore-lobehub' },
    );
    expect(payload.sub).toBe('user-1');
    expect(payload.scopes).toEqual(['school.portal']);
    expect(payload.active_org_id).toBeUndefined();
  });

  it('passes through the exact first-party source bootstrap redirect', async () => {
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'school-portal-secret');
    authApi.getSession.mockResolvedValue({
      user: { email: 'teacher@askcore.cn', id: 'user-2', role: 'user' },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          headers: {
            location: 'https://askcore.cn/school/teaching/local/askcore/warmup.php?destination=1',
          },
          status: 303,
        }),
      ),
    );
    const { GET } = await loadRoute();

    const response = await GET(
      new NextRequest(`https://askcore.cn/api/askcore/school/launch/${token}`),
      routeContext(['launch', token]),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'https://askcore.cn/school/teaching/local/askcore/warmup.php?destination=1',
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('forwards the operations surface and its exact first-party redirect', async () => {
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'school-portal-secret');
    authApi.getSession.mockResolvedValue({
      user: { email: 'admin@askcore.cn', id: 'system-1', role: 'super_admin' },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        headers: {
          location:
            'https://askcore.cn/school/teaching/local/askcore/warmup.php?destination=1&operations=1',
        },
        status: 303,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await loadRoute();

    const response = await GET(
      new NextRequest(`https://askcore.cn/api/askcore/school/launch/${token}?surface=operations`),
      routeContext(['launch', token]),
    );

    expect(response.status).toBe(303);
    expect((fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      `http://api:8000/api/school/v1/launch/${token}?surface=operations`,
    );
    expect(response.headers.get('location')).toBe(
      'https://askcore.cn/school/teaching/local/askcore/warmup.php?destination=1&operations=1',
    );
  });

  it('rejects any other school portal query before contacting the authority', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await loadRoute();

    const response = await GET(
      new NextRequest(`https://askcore.cn/api/askcore/school/launch/${token}?surface=teaching`),
      routeContext(['launch', token]),
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(authApi.getSession).not.toHaveBeenCalled();
  });

  it('forwards the dedicated system operations path without restoring generic workbench access', async () => {
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'school-portal-secret');
    authApi.getSession.mockResolvedValue({
      user: { email: 'admin@askcore.cn', id: 'system-1', role: 'super_admin' },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ redaction_passed: true, roster_projection_rows: 0, status: 'succeeded' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await loadRoute();

    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/school/operations'),
      routeContext(['operations']),
    );

    expect(response.status).toBe(200);
    expect((fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      'http://api:8000/api/school/v1/operations',
    );
  });

  it('blocks an upstream external redirect', async () => {
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'school-portal-secret');
    authApi.getSession.mockResolvedValue({
      user: { email: 'teacher@askcore.cn', id: 'user-2', role: 'user' },
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(null, { headers: { location: 'https://evil.example/' }, status: 303 }),
        ),
    );
    const { GET } = await loadRoute();

    const response = await GET(
      new NextRequest(`https://askcore.cn/api/askcore/school/launch/${token}`),
      routeContext(['launch', token]),
    );

    expect(response.status).toBe(502);
  });

  it('bounds an upstream request that never responds', async () => {
    vi.useFakeTimers();
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'school-portal-secret');
    authApi.getSession.mockResolvedValue({
      user: { email: 'student@askcore.cn', id: 'user-1', role: 'user' },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          }),
      ),
    );
    const { GET } = await loadRoute();
    const pending = GET(
      new NextRequest('https://askcore.cn/api/askcore/school/portal'),
      routeContext(['portal']),
    );

    await vi.advanceTimersByTimeAsync(10_000);
    expect((await pending).status).toBe(502);
    vi.useRealTimers();
  });

  it.each([
    'https://askcore.cn/school/teaching/local/askcore/warmup.php?destination=2',
    'https://askcore.cn/school/services/askcore/warmup.php?destination=1&next=/admin',
    'https://askcore.cn/school/teaching/local/askcore/warmup.php?destination=1&operations=2',
    'https://askcore.cn/school/teaching/local/askcore/warmup.php?destination=1&operations=1&operations=1',
    'https://askcore.cn/settings?destination=1',
  ])('blocks an unsafe first-party redirect: %s', async (location) => {
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'school-portal-secret');
    authApi.getSession.mockResolvedValue({
      user: { email: 'teacher@askcore.cn', id: 'user-2', role: 'user' },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { headers: { location }, status: 303 })),
    );
    const { GET } = await loadRoute();

    const response = await GET(
      new NextRequest(`https://askcore.cn/api/askcore/school/launch/${token}`),
      routeContext(['launch', token]),
    );

    expect(response.status).toBe(502);
  });

  it('rejects unknown routes and non-GET methods', async () => {
    const { GET, POST } = await loadRoute();
    const unknown = await GET(
      new NextRequest('https://askcore.cn/api/askcore/school/members'),
      routeContext(['members']),
    );
    const mutation = POST();

    expect(unknown.status).toBe(404);
    expect(mutation.status).toBe(405);
    expect(authApi.getSession).not.toHaveBeenCalled();
  });
});
