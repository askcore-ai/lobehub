// @vitest-environment node
import { createHash } from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { auth } from '@/auth';

import { DELETE, GET, POST, PUT } from './route';

const currentSchoolBinding = 'b'.repeat(64);
const resolveCurrentSchoolBinding = vi.hoisted(() => vi.fn());

vi.mock('@/auth', () => ({
  auth: {
    api: {
      getFullOrganization: vi.fn(),
      getSession: vi.fn(),
      listOrganizations: vi.fn(),
    },
  },
}));
vi.mock('@/server/services/schoolSessionBroker', () => ({ resolveCurrentSchoolBinding }));

const authApi = auth.api as typeof auth.api & {
  getFullOrganization: ReturnType<typeof vi.fn>;
  getSession: ReturnType<typeof vi.fn>;
  listOrganizations: ReturnType<typeof vi.fn>;
};

const routeContext = (route: string[] = ['account']) => ({
  params: Promise.resolve({ route }),
});

const schoolSourceProof = async ({
  schoolKey = 'askcore-online-school',
  sourceCellKey = 'askcore-online-school',
  sub = currentSchoolBinding,
} = {}) =>
  new SignJWT({
    administrator: true,
    member: true,
    school_key: schoolKey,
    source_cell_key: sourceCellKey,
    sub,
    typ: 'askcore-school-source-proof-v2',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer('askcore-gibbon')
    .setAudience('aitutor-school-source-proof')
    .setExpirationTime('2m')
    .setJti('source-proof-jti')
    .sign(new TextEncoder().encode('test-gibbon-source-proof-secret'));

describe('AskCore billing proxy route', () => {
  resolveCurrentSchoolBinding.mockResolvedValue({
    binding: currentSchoolBinding,
    schoolSubject: 'school_0123456789abcdef0123456789abcdef',
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resolveCurrentSchoolBinding.mockResolvedValue({
      binding: currentSchoolBinding,
      schoolSubject: 'school_0123456789abcdef0123456789abcdef',
    });
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

  it('binds school billing to the Better Auth user, source proof, route, and empty body', async () => {
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'test-lobehub-billing');
    vi.stubEnv('AITUTOR_API_BASE_URL', 'http://api:8000');
    authApi.getSession.mockResolvedValue({
      session: {},
      user: { email: 'student@example.test', id: 'user-1' },
    } as any);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sponsorship_status: 'assigned' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const sourceProof = await schoolSourceProof();

    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/billing/schools/askcore-online-school', {
        headers: { 'X-AskCore-School-Source-Proof': sourceProof },
      }),
      routeContext(['schools', 'askcore-online-school']),
    );

    expect(response.status).toBe(200);
    const [target, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(target.toString()).toBe('http://api:8000/api/billing/v1/schools/askcore-online-school');
    const headers = init.headers as Headers;
    expect(headers.get('X-AskCore-Billing-Assertion')).toBeNull();
    const assertion = headers.get('X-AskCore-School-Billing-Assertion');
    const { payload } = await jwtVerify(
      assertion!,
      new TextEncoder().encode('test-lobehub-billing'),
      { audience: 'aitutor-school-billing', issuer: 'askcore-lobehub' },
    );
    expect(payload).toMatchObject({
      body_sha256: createHash('sha256').update(new Uint8Array()).digest('hex'),
      method: 'GET',
      path: '/api/billing/v1/schools/askcore-online-school',
      school_key: 'askcore-online-school',
      source_binding: currentSchoolBinding,
      source_cell_key: 'askcore-online-school',
      source_proof: sourceProof,
      sub: 'user-1',
      typ: 'askcore-school-billing-request',
    });
    expect(resolveCurrentSchoolBinding).toHaveBeenCalledWith(expect.any(Headers));
  });

  it('hashes school mutation bodies and forwards the idempotency key', async () => {
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'test-lobehub-billing');
    vi.stubEnv('AITUTOR_API_BASE_URL', 'http://api:8000');
    authApi.getSession.mockResolvedValue({
      session: {},
      user: { email: 'admin@example.test', id: 'user-1' },
    } as any);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ seat_id: 7 }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const body = JSON.stringify({
      eligibility_token: 'opaque-token',
      expected_assignment_version: 2,
    });
    const request = new NextRequest(
      'https://askcore.cn/api/askcore/billing/schools/askcore-online-school/seats/7/assignment',
      {
        body,
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': 'seat-assignment-7-v2',
          'origin': 'https://askcore.cn',
          'X-AskCore-School-Source-Proof': await schoolSourceProof(),
        },
        method: 'PUT',
      },
    );

    const response = await PUT(
      request,
      routeContext(['schools', 'askcore-online-school', 'seats', '7', 'assignment']),
    );

    expect(response.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get('Idempotency-Key')).toBe('seat-assignment-7-v2');
    expect(init.body).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(init.body as Uint8Array)).toBe(body);
    const { payload } = await jwtVerify(
      headers.get('X-AskCore-School-Billing-Assertion')!,
      new TextEncoder().encode('test-lobehub-billing'),
      { audience: 'aitutor-school-billing', issuer: 'askcore-lobehub' },
    );
    expect(payload.body_sha256).toBe(createHash('sha256').update(body).digest('hex'));
    expect(payload.method).toBe('PUT');
  });

  it('binds the school seat release reason in the signed JSON body', async () => {
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'test-lobehub-billing');
    vi.stubEnv('AITUTOR_API_BASE_URL', 'http://api:8000');
    authApi.getSession.mockResolvedValue({
      session: {},
      user: { email: 'admin@example.test', id: 'user-1' },
    } as any);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ seat_id: 7 }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const body = JSON.stringify({ reason: 'admin_release' });
    const request = new NextRequest(
      'https://askcore.cn/api/askcore/billing/schools/askcore-online-school/seats/7/assignment',
      {
        body,
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': 'seat-release-7-v2',
          'origin': 'https://askcore.cn',
          'X-AskCore-School-Source-Proof': await schoolSourceProof(),
        },
        method: 'DELETE',
      },
    );

    const response = await DELETE(
      request,
      routeContext(['schools', 'askcore-online-school', 'seats', '7', 'assignment']),
    );

    expect(response.status).toBe(200);
    const [target, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(target.search).toBe('');
    expect(new TextDecoder().decode(init.body as Uint8Array)).toBe(body);
    const headers = init.headers as Headers;
    const { payload } = await jwtVerify(
      headers.get('X-AskCore-School-Billing-Assertion')!,
      new TextEncoder().encode('test-lobehub-billing'),
      { audience: 'aitutor-school-billing', issuer: 'askcore-lobehub' },
    );
    expect(payload.body_sha256).toBe(createHash('sha256').update(body).digest('hex'));
    expect(payload.method).toBe('DELETE');
  });

  it('rejects a source proof for another Better Auth account before forwarding', async () => {
    vi.stubEnv('BILLING_LOBEHUB_ASSERTION_SECRET', 'test-lobehub-billing');
    authApi.getSession.mockResolvedValue({
      session: {},
      user: { email: 'student@example.test', id: 'user-1' },
    } as any);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/billing/schools/askcore-online-school', {
        headers: {
          'X-AskCore-School-Source-Proof': await schoolSourceProof({ sub: 'attacker' }),
        },
      }),
      routeContext(['schools', 'askcore-online-school']),
    );

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
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

  it('forwards auto top-up saves with PUT', async () => {
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
      new Response(JSON.stringify({ enabled: false }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('https://askcore.cn/api/askcore/billing/credits/auto-topup', {
      body: JSON.stringify({ enabled: false, monthly_limit_cny: 0 }),
      headers: { 'content-type': 'application/json', 'origin': 'https://askcore.cn' },
      method: 'PUT',
    });

    const response = await PUT(request, routeContext(['credits', 'auto-topup']));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ enabled: false });
    const [target, init] = fetchMock.mock.calls[0] as [URL, RequestInit & { duplex?: string }];
    expect(target.toString()).toBe('http://api:8000/api/billing/v1/credits/auto-topup');
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(request.body);
    expect(init.duplex).toBe('half');
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
