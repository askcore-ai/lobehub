// @vitest-environment node
import { jwtVerify } from 'jose';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { auth } from '@/auth';

import { GET } from './route';

vi.mock('@/auth', () => ({
  auth: {
    api: {
      getFullOrganization: vi.fn(),
      getSession: vi.fn(),
    },
  },
}));

const authApi = auth.api as typeof auth.api & {
  getFullOrganization: ReturnType<typeof vi.fn>;
  getSession: ReturnType<typeof vi.fn>;
};

const routeContext = (route: string[] = ['dashboard']) => ({
  params: Promise.resolve({ route }),
});

describe('AskCore workbench proxy route', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns 401 when the LobeHub session is missing', async () => {
    authApi.getSession.mockResolvedValue(null);

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
});
