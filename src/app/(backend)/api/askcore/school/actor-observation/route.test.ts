// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const authApi = vi.hoisted(() => ({ getSession: vi.fn() }));
const buildAskCoreAssertion = vi.hoisted(() => vi.fn());

vi.mock('@/server/services/askcoreAssertion', () => ({
  askCoreAssertionHeaderName: () => 'X-AskCore-Billing-Assertion',
  buildAskCoreAssertion,
  getAskCoreAssertionAuthApi: vi.fn(async () => authApi),
}));

const proofHeaders = {
  'content-type': 'application/json',
  'x-askcore-deployment': '9',
  'x-askcore-nonce': '0123456789abcdef0123456789abcdef',
  'x-askcore-signature': 'f'.repeat(64),
  'x-askcore-timestamp': '1784426400',
};

const request = (url = 'https://askcore.cn/api/askcore/school/actor-observation') =>
  new NextRequest(url, { body: '{}', headers: proofHeaders, method: 'POST' });

describe('AskCore Moodle actor observation', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('forwards only connector proof, the bounded body, and a current-account assertion', async () => {
    authApi.getSession.mockResolvedValue({
      session: { activeOrganizationId: 'must-not-forward', id: 'session-b' },
      user: { email: 'student@example.test', id: 'account-b' },
    });
    buildAskCoreAssertion.mockResolvedValue('signed-current-account');
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ counts: { created: 1 }, state: 'created' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('./route');

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(buildAskCoreAssertion).toHaveBeenCalledWith({
      scopes: ['school.identity.write'],
      sub: 'account-b',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://api:8000/api/lms-connectors/v2/processing/actor-observations');
    expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe('{}');
    const headers = init?.headers as Headers;
    expect(headers.get('X-AskCore-Deployment')).toBe('9');
    expect(headers.get('X-AskCore-Billing-Assertion')).toBe('signed-current-account');
    expect(headers.has('cookie')).toBe(false);
    expect(headers.has('authorization')).toBe(false);
  });

  it('supports only the exact HMAC-authenticated readiness query without a user session', async () => {
    authApi.getSession.mockResolvedValue(null);
    buildAskCoreAssertion.mockResolvedValue('signed-readiness');
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ contract: 'moodle_actor_observation_readiness@v1', status: 'ready' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('./route');

    const response = await POST(
      request('https://askcore.cn/api/askcore/school/actor-observation?readiness=1'),
    );

    expect(response.status).toBe(200);
    expect(buildAskCoreAssertion).toHaveBeenCalledWith({
      scopes: ['school.identity.readiness'],
      sub: 'moodle-actor-observation-readiness',
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'http://api:8000/api/lms-connectors/v2/processing/actor-observations/readiness',
    );

    const invalid = await POST(
      request('https://askcore.cn/api/askcore/school/actor-observation?readiness=1&extra=1'),
    );
    expect(invalid.status).toBe(404);
  });

  it('fails closed without a session, connector proof, or a bounded body', async () => {
    authApi.getSession.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('./route');

    expect((await POST(request())).status).toBe(401);

    authApi.getSession.mockResolvedValue({ session: { id: 's' }, user: { id: 'account-b' } });
    expect(
      (
        await POST(
          new NextRequest('https://askcore.cn/api/askcore/school/actor-observation', {
            body: '{}',
            headers: { 'content-type': 'application/json' },
            method: 'POST',
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await POST(
          new NextRequest('https://askcore.cn/api/askcore/school/actor-observation', {
            body: 'x'.repeat(1025),
            headers: proofHeaders,
            method: 'POST',
          }),
        )
      ).status,
    ).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps timeout, redirect, non-JSON, and oversized upstream responses to 502', async () => {
    authApi.getSession.mockResolvedValue({ session: { id: 's' }, user: { id: 'account-b' } });
    buildAskCoreAssertion.mockResolvedValue('signed-current-account');
    const { POST } = await import('./route');

    for (const response of [
      new Response(null, { headers: { location: 'https://example.test' }, status: 302 }),
      new Response('html', { headers: { 'content-type': 'text/html' }, status: 200 }),
      new Response(JSON.stringify({ value: 'x'.repeat(5000) }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    ]) {
      vi.stubGlobal('fetch', vi.fn(async () => response));
      expect((await POST(request())).status).toBe(502);
    }

    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
      ),
    );
    const pending = POST(request());
    await vi.advanceTimersByTimeAsync(3000);
    expect((await pending).status).toBe(502);
  });
});
