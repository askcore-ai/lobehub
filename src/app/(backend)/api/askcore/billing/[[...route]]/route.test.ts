// @vitest-environment node
import { jwtVerify } from 'jose';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { auth } from '@/auth';

import { GET, POST } from './route';

vi.mock('@/auth', () => ({
  auth: {
    api: {
      getFullOrganization: vi.fn(),
      getSession: vi.fn(),
      listOrganizations: vi.fn(),
    },
  },
}));

const authApi = auth.api as typeof auth.api & {
  getFullOrganization: ReturnType<typeof vi.fn>;
  getSession: ReturnType<typeof vi.fn>;
  listOrganizations: ReturnType<typeof vi.fn>;
};

const routeContext = (route: string[] = ['account']) => ({
  params: Promise.resolve({ route }),
});

describe('AskCore billing proxy route', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns 401 when the LobeHub session is missing', async () => {
    authApi.getSession.mockResolvedValue(null);

    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/billing/account'),
      routeContext(),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      detail: 'LobeHub session is required for billing',
    });
  });

  it('rejects cross-origin billing writes before session lookup', async () => {
    const response = await POST(
      new NextRequest('https://askcore.cn/api/askcore/billing/checkout/subscription', {
        body: JSON.stringify({ plan_id: 'pro' }),
        headers: { origin: 'https://evil.example' },
        method: 'POST',
      }),
      routeContext(['checkout', 'subscription']),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      detail: 'Cross-origin billing writes are not allowed',
    });
    expect(authApi.getSession).not.toHaveBeenCalled();
  });

  it('rejects billing writes with spoofed forwarded host origin', async () => {
    const response = await POST(
      new NextRequest('https://askcore.cn/api/askcore/billing/checkout/subscription', {
        body: JSON.stringify({ plan_id: 'pro' }),
        headers: {
          'origin': 'https://evil.example',
          'x-forwarded-host': 'evil.example',
          'x-forwarded-proto': 'https',
        },
        method: 'POST',
      }),
      routeContext(['checkout', 'subscription']),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      detail: 'Cross-origin billing writes are not allowed',
    });
    expect(authApi.getSession).not.toHaveBeenCalled();
  });

  it('rejects browser cross-site billing writes when Origin is omitted', async () => {
    const response = await POST(
      new NextRequest('https://askcore.cn/api/askcore/billing/checkout/subscription', {
        body: JSON.stringify({ plan_id: 'pro' }),
        headers: { 'sec-fetch-site': 'cross-site' },
        method: 'POST',
      }),
      routeContext(['checkout', 'subscription']),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      detail: 'Cross-origin billing writes are not allowed',
    });
    expect(authApi.getSession).not.toHaveBeenCalled();
  });

  it('rejects invalid billing route segments before session lookup', async () => {
    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/billing/payments/pay%0Ament'),
      routeContext(['payments', 'pay\nment']),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      detail: 'Invalid AskCore route segment',
    });
    expect(authApi.getSession).not.toHaveBeenCalled();
  });

  it('signs a server assertion and forwards valid sessions to FastAPI', async () => {
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'test-lobehub-billing');
    vi.stubEnv('AITUTOR_API_BASE_URL', 'http://api:8000');
    authApi.getSession.mockResolvedValue({
      session: { activeOrganizationId: 'org-1' },
      user: { email: 'seednov@outlook.com', id: 'user-1' },
    } as any);
    authApi.getFullOrganization.mockResolvedValue({
      id: 'org-1',
      members: [{ role: 'owner', userId: 'user-1' }],
      name: 'Seednov',
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/billing/account?limit=10'),
      routeContext(['account']),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(authApi.getFullOrganization).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      query: { membersLimit: 100, organizationId: 'org-1' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [target, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(target.toString()).toBe('http://api:8000/api/billing/v1/account?limit=10');
    expect(init.method).toBe('GET');

    const headers = init.headers as Headers;
    const assertion = headers.get('X-AskCore-Billing-Assertion');
    expect(assertion).toBeTruthy();

    const { payload } = await jwtVerify(
      assertion!,
      new TextEncoder().encode('test-lobehub-billing'),
      {
        audience: 'aitutor-billing',
        issuer: 'askcore-lobehub',
      },
    );
    expect(payload.sub).toBe('user-1');
    expect(payload.email).toBe('seednov@outlook.com');
    expect(payload.active_org_id).toBe('org-1');
    expect(payload.active_org_name).toBe('Seednov');
    expect(payload.organization_role).toBe('owner');
  });

  it('allows the public AskCore origin when the internal billing origin is a bind address', async () => {
    vi.stubEnv('APP_URL', 'http://0.0.0.0:3210');
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'test-lobehub-billing');
    vi.stubEnv('AITUTOR_API_BASE_URL', 'http://api:8000');
    authApi.getSession.mockResolvedValue({
      session: { activeOrganizationId: 'org-1' },
      user: { email: 'seednov@outlook.com', id: 'user-1' },
    } as any);
    authApi.getFullOrganization.mockResolvedValue({
      id: 'org-1',
      members: [{ role: 'owner', userId: 'user-1' }],
      name: 'Seednov',
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest(
      'http://0.0.0.0:3210/api/askcore/billing/checkout/subscription',
      {
        body: JSON.stringify({ plan_id: 'pro' }),
        headers: { 'content-type': 'application/json', 'origin': 'https://askcore.cn' },
        method: 'POST',
      },
    );
    const arrayBufferSpy = vi.spyOn(request, 'arrayBuffer');

    const response = await POST(request, routeContext(['checkout', 'subscription']));

    expect(response.status).toBe(200);
    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit & { duplex?: string }];
    expect(init.body).toBe(request.body);
    expect(init.duplex).toBe('half');
    expect((init.headers as Headers).get('content-type')).toBe('application/json');
  });

  it('falls back to the only organization when the session has no active organization', async () => {
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'test-lobehub-billing');
    vi.stubEnv('AITUTOR_API_BASE_URL', 'http://api:8000');
    authApi.getSession.mockResolvedValue({
      session: {},
      user: { email: 'seednov@outlook.com', id: 'user-1' },
    } as any);
    authApi.listOrganizations.mockResolvedValue([{ id: 'org-1', name: 'Seednov' }]);
    authApi.getFullOrganization.mockResolvedValue({
      id: 'org-1',
      members: [{ role: 'owner', userId: 'user-1' }],
      name: 'Seednov',
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/billing/account'),
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
      new TextEncoder().encode('test-lobehub-billing'),
      {
        audience: 'aitutor-billing',
        issuer: 'askcore-lobehub',
      },
    );
    expect(payload.active_org_id).toBe('org-1');
    expect(payload.organization_role).toBe('owner');
  });
});
