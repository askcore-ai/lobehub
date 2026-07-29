// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const authApi = vi.hoisted(() => ({ getSession: vi.fn() }));
const buildAskCoreAssertion = vi.hoisted(() => vi.fn());

vi.mock('@/server/services/askcoreAssertion', () => ({
  askCoreAssertionHeaderName: () => 'X-AskCore-Billing-Assertion',
  buildAskCoreAssertion,
  getAskCoreAssertionAuthApi: vi.fn(async () => authApi),
  resolveAskCorePrincipalClaims: vi.fn(() => ({ scopes: ['school.portal'], sub: 'account-1' })),
  validateAskCoreRouteSegments: vi.fn(() => true),
}));

const context = (route: string[]) => ({ params: Promise.resolve({ route }) });

describe('native school shell authority proxy', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each(['portal', 'operations'])('proxies the authenticated %s read with no-store', async (name) => {
    authApi.getSession.mockResolvedValue({ session: { id: 's' }, user: { id: 'u' } });
    buildAskCoreAssertion.mockResolvedValue('signed');
    const fetchMock = vi.fn(async (_input: unknown) =>
      new Response(JSON.stringify({ status: 'succeeded' }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('./route');
    const response = await GET(
      new NextRequest(`https://askcore.cn/api/askcore/school/${name}`),
      context([name]),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`http://api:8000/api/school/v1/${name}`);
  });

  it('hard-cuts every legacy launch route', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/school/launch/opaque'),
      context(['launch', 'opaque']),
    );
    expect(response.status).toBe(404);
    expect(authApi.getSession).not.toHaveBeenCalled();
  });

  it('rejects query-bearing portal reads', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/school/portal?surface=operations'),
      context(['portal']),
    );
    expect(response.status).toBe(404);
  });

  it('requires a Better Auth session', async () => {
    authApi.getSession.mockResolvedValue(null);
    const { GET } = await import('./route');
    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/school/portal'),
      context(['portal']),
    );
    expect(response.status).toBe(401);
  });

  it('bounds an upstream request that never responds', async () => {
    vi.useFakeTimers();
    authApi.getSession.mockResolvedValue({ session: { id: 's' }, user: { id: 'u' } });
    buildAskCoreAssertion.mockResolvedValue('signed');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          }),
      ),
    );
    const { GET } = await import('./route');
    const pending = GET(
      new NextRequest('https://askcore.cn/api/askcore/school/portal'),
      context(['portal']),
    );

    await vi.advanceTimersByTimeAsync(8000);
    expect((await pending).status).toBe(502);
  });
});
