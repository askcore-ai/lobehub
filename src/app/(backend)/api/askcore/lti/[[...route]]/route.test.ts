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

const organizationMock = vi.hoisted(() => ({
  persistedActiveOrganizationIdFromSession: vi.fn(async () => undefined),
}));

vi.mock('@/server/services/askcoreOrganization', () => ({
  persistedActiveOrganizationIdFromSession:
    organizationMock.persistedActiveOrganizationIdFromSession,
}));

const routeContext = (route: string[]) => ({ params: Promise.resolve({ route }) });
const loadRoute = () => import('./route');

describe('AskCore processing proxy', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__ASKCORE_WORKBENCH_ROUTE_AUTH__ = { api: authApi };
    (globalThis as Record<string, unknown>).__ASKCORE_WORKBENCH_ROUTE_PERSISTED_ACTIVE_ORG_ID__ =
      organizationMock.persistedActiveOrganizationIdFromSession;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>).__ASKCORE_WORKBENCH_ROUTE_AUTH__;
    delete (globalThis as Record<string, unknown>)
      .__ASKCORE_WORKBENCH_ROUTE_PERSISTED_ACTIVE_ORG_ID__;
  });

  it('requires a Better Auth session', async () => {
    authApi.getSession.mockResolvedValue(null);
    const { GET } = await loadRoute();

    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/lti/processing/context'),
      routeContext(['processing', 'context']),
    );

    expect(response.status).toBe(401);
    expect(authApi.getFullOrganization).not.toHaveBeenCalled();
  });

  it('publishes Tool JWKS without a Better Auth session or cookies', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ keys: [{ alg: 'RS256', kid: 'pilot-key', kty: 'RSA' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await loadRoute();

    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/lti/jwks', {
        headers: { cookie: 'better-auth.session=private' },
      }),
      routeContext(['jwks']),
    );

    expect(response.status).toBe(200);
    expect(authApi.getSession).not.toHaveBeenCalled();
    const [target, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(target.toString()).toBe('http://api:8000/api/lti/v1/jwks');
    expect((init.headers as Headers).has('cookie')).toBe(false);
    expect((init.headers as Headers).has('X-AskCore-Billing-Assertion')).toBe(false);
  });

  it('forwards the public OIDC login redirect without following it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        headers: { location: 'http://moodle-pilot.example/mod/lti/auth.php?state=opaque' },
        status: 302,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await loadRoute();

    const response = await POST(
      new NextRequest('https://askcore.cn/api/askcore/lti/launch/login', {
        body: new URLSearchParams({
          iss: 'http://moodle-pilot.example',
          login_hint: 'opaque-login',
          target_link_uri: 'https://askcore.cn/api/askcore/lti/launch',
        }),
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'origin': 'http://moodle-pilot.example',
          'sec-fetch-site': 'cross-site',
        },
        method: 'POST',
      }),
      routeContext(['launch', 'login']),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('moodle-pilot.example/mod/lti/auth.php');
    expect(authApi.getSession).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
  });

  it('forwards a cross-site Resource Link launch and only its handoff cookie', async () => {
    const responseHeaders = new Headers({
      location:
        'https://askcore.cn/askcore/workbench?protocol=processing&launch=0123456789abcdef0123456789abcdef',
    });
    responseHeaders.append(
      'set-cookie',
      'askcore_lti_handoff_0123456789abcdef0123456789abcdef=handoff-token; Path=/; HttpOnly; Secure; SameSite=None',
    );
    responseHeaders.append('set-cookie', 'unrelated_cookie=blocked; Path=/');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { headers: responseHeaders, status: 303 }));
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await loadRoute();

    const response = await POST(
      new NextRequest('https://askcore.cn/api/askcore/lti/launch', {
        body: new URLSearchParams({ id_token: 'signed-id-token', state: 'signed-state' }),
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'origin': 'http://moodle-pilot.example',
          'sec-fetch-site': 'cross-site',
        },
        method: 'POST',
      }),
      routeContext(['launch']),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toContain('protocol=processing');
    expect(response.headers.get('set-cookie')).toContain(
      'askcore_lti_handoff_0123456789abcdef0123456789abcdef=handoff-token',
    );
    expect(response.headers.get('set-cookie')).not.toContain('unrelated_cookie');
    expect(authApi.getSession).not.toHaveBeenCalled();
  });

  it('rejects cross-origin protocol mutations before session lookup', async () => {
    const { PATCH } = await loadRoute();
    const response = await PATCH(
      new NextRequest('https://askcore.cn/api/askcore/lti/processing/current/result', {
        body: JSON.stringify({ expected_latest_artifact_id: 'artifact-1', questions: [] }),
        headers: { origin: 'https://evil.example' },
        method: 'PATCH',
      }),
      routeContext(['processing', 'current', 'result']),
    );

    expect(response.status).toBe(403);
    expect(authApi.getSession).not.toHaveBeenCalled();
  });

  it('accepts an identity invitation only through the current Better Auth account', async () => {
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'protocol-proxy-secret');
    authApi.getSession.mockResolvedValue({
      session: { activeOrganizationId: 'org-1' },
      user: { email: 'teacher@askcore.cn', id: 'user-1' },
    } as any);
    authApi.getFullOrganization.mockResolvedValue({
      id: 'org-1',
      members: [{ role: 'member', userId: 'user-1' }],
      name: 'School',
    });
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        account_user_id: 'user-1',
        deployment_id: 7,
        identity_link_id: 9,
        invitation_id: 'invitation-1',
        invitation_status: 'accepted',
        link_status: 'active',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await loadRoute();

    const response = await POST(
      new NextRequest('https://askcore.cn/api/askcore/lti/identity-links/accept', {
        body: JSON.stringify({ invitation_token: 'one-time-token' }),
        headers: { 'content-type': 'application/json', 'origin': 'https://askcore.cn' },
        method: 'POST',
      }),
      routeContext(['identity-links', 'accept']),
    );

    expect(response.status).toBe(200);
    const [target, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(target.toString()).toBe('http://api:8000/api/lti/v1/identity-links/accept');
    const headers = init.headers as Headers;
    expect(headers.get('X-AskCore-Billing-Assertion')).toBeTruthy();
    expect(headers.has('cookie')).toBe(false);
  });

  it('reads identity-link ownership only for the current Better Auth account', async () => {
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'protocol-proxy-secret');
    authApi.getSession.mockResolvedValue({
      user: { email: 'student@askcore.cn', id: 'student-1' },
    } as any);
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        deployment_id: 7,
        linked: true,
        school_subject: 'school_opaque_subject',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await loadRoute();

    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/lti/identity-links/account-subject'),
      routeContext(['identity-links', 'account-subject']),
    );

    expect(response.status).toBe(200);
    expect(authApi.getFullOrganization).not.toHaveBeenCalled();
    const [target, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(target.toString()).toBe('http://api:8000/api/lti/v1/identity-links/account-subject');
    const assertion = (init.headers as Headers).get('X-AskCore-Billing-Assertion');
    const { payload } = await jwtVerify(
      assertion!,
      new TextEncoder().encode('protocol-proxy-secret'),
      { audience: 'aitutor-billing', issuer: 'askcore-lobehub' },
    );
    expect(payload.sub).toBe('student-1');
    expect(payload.org_id).toBeUndefined();
  });

  it('forwards only protocol cookies and propagates the context cookie', async () => {
    vi.stubEnv('AITUTOR_API_BASE_URL', 'http://api:8000');
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'protocol-proxy-secret');
    authApi.getSession.mockResolvedValue({
      session: { activeOrganizationId: 'org-1' },
      user: { email: 'teacher@askcore.cn', id: 'user-1' },
    } as any);
    authApi.getFullOrganization.mockResolvedValue({
      id: 'org-1',
      members: [{ role: 'member', userId: 'user-1' }],
      name: 'School',
    });
    const responseHeaders = new Headers({ 'content-type': 'application/json' });
    responseHeaders.append(
      'set-cookie',
      'askcore_lti_processing_0123456789abcdef0123456789abcdef=context-token; Path=/; HttpOnly; Secure; SameSite=None',
    );
    responseHeaders.append('set-cookie', 'unrelated_cookie=blocked; Path=/');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ context_kind: 'processing' }), {
        headers: responseHeaders,
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await loadRoute();

    const response = await POST(
      new NextRequest(
        'https://askcore.cn/api/askcore/lti/processing/context?launch=0123456789abcdef0123456789abcdef',
        {
          headers: {
            cookie:
              'better-auth.session=private; askcore_lti_handoff_0123456789abcdef0123456789abcdef=handoff-token; askcore_lti_handoff_ffffffffffffffffffffffffffffffff=foreign; tracking=private',
            origin: 'https://askcore.cn',
          },
          method: 'POST',
        },
      ),
      routeContext(['processing', 'context']),
    );

    expect(response.status).toBe(200);
    const [target, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(target.toString()).toBe(
      'http://api:8000/api/lti/v1/processing/context?launch=0123456789abcdef0123456789abcdef',
    );
    const headers = init.headers as Headers;
    expect(headers.get('cookie')).toBe(
      'askcore_lti_handoff_0123456789abcdef0123456789abcdef=handoff-token',
    );
    expect(headers.get('cookie')).not.toContain('better-auth');
    const assertion = headers.get('X-AskCore-Billing-Assertion');
    expect(assertion).toBeTruthy();
    const { payload } = await jwtVerify(
      assertion!,
      new TextEncoder().encode('protocol-proxy-secret'),
      { audience: 'aitutor-billing', issuer: 'askcore-lobehub' },
    );
    expect(payload.sub).toBe('user-1');
    expect(payload.org_id).toBeUndefined();
    expect(payload.active_org_id).toBeUndefined();
    expect(authApi.getFullOrganization).not.toHaveBeenCalled();
    expect(response.headers.get('set-cookie')).toContain(
      'askcore_lti_processing_0123456789abcdef0123456789abcdef=context-token',
    );
    expect(response.headers.get('set-cookie')).not.toContain('unrelated_cookie');
  });

  it('forwards account-owned capture routes without resolving an organization', async () => {
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'protocol-proxy-secret');
    authApi.getSession.mockResolvedValue({
      user: { email: 'student@askcore.cn', id: 'student-1' },
    } as any);
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ scanners: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await loadRoute();

    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/lti/processing/capture/scanners'),
      routeContext(['processing', 'capture', 'scanners']),
    );

    expect(response.status).toBe(200);
    expect(authApi.getFullOrganization).not.toHaveBeenCalled();
    const [target, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(target.toString()).toBe('http://api:8000/api/lti/v1/processing/capture/scanners');
    const assertion = (init.headers as Headers).get('X-AskCore-Billing-Assertion');
    const { payload } = await jwtVerify(
      assertion!,
      new TextEncoder().encode('protocol-proxy-secret'),
      { audience: 'aitutor-billing', issuer: 'askcore-lobehub' },
    );
    expect(payload.sub).toBe('student-1');
    expect(payload.org_id).toBeUndefined();
  });

  it('rejects empty, malformed, and retired teaching paths', async () => {
    const { GET } = await loadRoute();
    const empty = await GET(
      new NextRequest('https://askcore.cn/api/askcore/lti'),
      routeContext([]),
    );
    const malformed = await GET(
      new NextRequest('https://askcore.cn/api/askcore/lti/processing/context'),
      routeContext(['processing', 'context\n']),
    );
    const retired = await GET(
      new NextRequest('https://askcore.cn/api/askcore/lti/activities/current'),
      routeContext(['activities', 'current']),
    );

    expect(empty.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(retired.status).toBe(404);
  });
});
