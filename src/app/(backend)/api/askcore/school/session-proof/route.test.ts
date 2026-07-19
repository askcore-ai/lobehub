// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const authApi = vi.hoisted(() => ({ getSession: vi.fn() }));
const resolveSchoolOIDCSubject = vi.hoisted(() => vi.fn());
const buildAskCoreAssertion = vi.hoisted(() => vi.fn());

vi.mock('@/server/services/askcoreAssertion', () => ({
  askCoreAssertionHeaderName: () => 'X-AskCore-Billing-Assertion',
  buildAskCoreAssertion,
  getAskCoreAssertionAuthApi: vi.fn(async () => authApi),
}));
vi.mock('@/libs/oidc-provider/provider', () => ({ resolveSchoolOIDCSubject }));

describe('AskCore school current-session proof', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns only the current Better Auth account pseudonymous school subject', async () => {
    authApi.getSession.mockResolvedValue({
      session: { id: 'session-b' },
      user: { email: 'student@example.test', id: 'account-b' },
    });
    resolveSchoolOIDCSubject.mockResolvedValue('school_0123456789abcdef0123456789abcdef');
    const { GET } = await import('./route');

    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/school/session-proof', {
        headers: { cookie: 'better-auth.session_token=opaque' },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    await expect(response.json()).resolves.toEqual({
      school_subject: 'school_0123456789abcdef0123456789abcdef',
    });
    expect(resolveSchoolOIDCSubject).toHaveBeenCalledWith({
      email: 'student@example.test',
      userId: 'account-b',
    });
  });

  it('fails closed without a current Better Auth session', async () => {
    authApi.getSession.mockResolvedValue(null);
    const { GET, POST } = await import('./route');

    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/school/session-proof'),
    );

    expect(response.status).toBe(401);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const postResponse = await POST(
      new NextRequest('https://askcore.cn/api/askcore/school/session-proof', {
        body: '{}',
        headers: {
          'x-askcore-deployment': '9',
          'x-askcore-nonce': '0123456789abcdef0123456789abcdef',
          'x-askcore-signature': 'f'.repeat(64),
          'x-askcore-timestamp': '1784426400',
        },
        method: 'POST',
      }),
    );
    expect(postResponse.status).toBe(401);
    expect(resolveSchoolOIDCSubject).not.toHaveBeenCalled();
    expect(buildAskCoreAssertion).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('adds the current account assertion while forwarding only the Moodle dual proof', async () => {
    const session = {
      organization: { id: 'must-not-forward' },
      session: { activeOrganizationId: 'must-not-forward', id: 'session-b' },
      user: { email: 'student@example.test', id: 'account-b' },
    };
    const payload = {
      actor_binding: 'a'.repeat(64),
      school_subject_hash: 'b'.repeat(64),
    };
    const rawBody = ` { "school_subject_hash" : "${payload.school_subject_hash}", "actor_binding" : "${payload.actor_binding}" } `;
    authApi.getSession.mockResolvedValue(session);
    buildAskCoreAssertion.mockResolvedValue('signed-current-account');
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            counts: { created: 1, existing: 0, retired: 0 },
            state: 'created',
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('./route');

    const response = await POST(
      new NextRequest('https://askcore.cn/api/askcore/school/session-proof', {
        body: rawBody,
        headers: {
          'authorization': 'Bearer must-not-forward',
          'cookie': 'better-auth.session_token=opaque',
          'content-type': 'application/json',
          'x-askcore-billing-assertion': 'client-forged-assertion',
          'x-askcore-deployment': '9',
          'x-askcore-nonce': '0123456789abcdef0123456789abcdef',
          'x-askcore-signature': 'f'.repeat(64),
          'x-askcore-timestamp': '1784426400',
        },
        method: 'POST',
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      counts: { created: 1, existing: 0, retired: 0 },
      state: 'created',
    });
    expect(buildAskCoreAssertion).toHaveBeenCalledWith({
      scopes: ['school.identity.write'],
      sub: 'account-b',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(init).toBeDefined();
    expect(String(url)).toBe('http://api:8000/api/lms-connectors/v2/processing/actor-observations');
    expect(init?.method).toBe('POST');
    expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe(rawBody);
    const headers = init?.headers as Headers;
    expect(headers.get('X-AskCore-Deployment')).toBe('9');
    expect(headers.get('X-AskCore-Timestamp')).toBe('1784426400');
    expect(headers.get('X-AskCore-Nonce')).toBe('0123456789abcdef0123456789abcdef');
    expect(headers.get('X-AskCore-Signature')).toBe('f'.repeat(64));
    expect(headers.get('X-AskCore-Billing-Assertion')).toBe('signed-current-account');
    expect(headers.has('cookie')).toBe(false);
    expect(headers.has('authorization')).toBe(false);
    expect([...headers.keys()].some((name) => name.includes('org'))).toBe(false);
  });

  it('proves the full non-mutating actor-observation chain without a user session', async () => {
    authApi.getSession.mockResolvedValue(null);
    buildAskCoreAssertion.mockResolvedValue('signed-readiness-assertion');
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            contract: 'moodle_actor_observation_readiness@v1',
            status: 'ready',
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('./route');

    const response = await POST(
      new NextRequest('https://askcore.cn/api/askcore/school/session-proof?readiness=1', {
        body: '{}',
        headers: {
          'x-askcore-deployment': '9',
          'x-askcore-nonce': 'readiness0123456789abcdef01234567',
          'x-askcore-signature': 'e'.repeat(64),
          'x-askcore-timestamp': '1784426400',
        },
        method: 'POST',
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    await expect(response.json()).resolves.toEqual({
      contract: 'moodle_actor_observation_readiness@v1',
      status: 'ready',
    });
    expect(authApi.getSession).not.toHaveBeenCalled();
    expect(buildAskCoreAssertion).toHaveBeenCalledWith({
      scopes: ['school.identity.readiness'],
      sub: 'moodle-actor-observation-readiness',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'http://api:8000/api/lms-connectors/v2/processing/actor-observations/readiness',
    );
    expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe('{}');
    const headers = init?.headers as Headers;
    expect(headers.get('X-AskCore-Billing-Assertion')).toBe('signed-readiness-assertion');
    expect(headers.has('cookie')).toBe(false);
    expect(headers.has('authorization')).toBe(false);
  });

  it('does not sign a malformed readiness probe', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('./route');

    const response = await POST(
      new NextRequest('https://askcore.cn/api/askcore/school/session-proof?readiness=1', {
        body: '{"unexpected":true}',
        headers: {
          'x-askcore-deployment': '9',
          'x-askcore-nonce': 'readiness0123456789abcdef01234567',
          'x-askcore-signature': 'e'.repeat(64),
          'x-askcore-timestamp': '1784426400',
        },
        method: 'POST',
      }),
    );

    expect(response.status).toBe(400);
    expect(buildAskCoreAssertion).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an oversized declared request without reading its body', async () => {
    let bodyPulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        bodyPulls += 1;
        if (bodyPulls > 1) throw new Error('oversized body must not be consumed');
        controller.enqueue(new Uint8Array([1]));
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('./route');

    const response = await POST(
      new NextRequest('https://askcore.cn/api/askcore/school/session-proof?readiness=1', {
        body,
        headers: {
          'content-length': '1025',
          'x-askcore-deployment': '9',
          'x-askcore-nonce': 'readiness0123456789abcdef01234567',
          'x-askcore-signature': 'e'.repeat(64),
          'x-askcore-timestamp': '1784426400',
        },
        method: 'POST',
        duplex: 'half',
      } as unknown as ConstructorParameters<typeof NextRequest>[1]),
    );

    expect(response.status).toBe(400);
    expect(bodyPulls).toBeLessThanOrEqual(1);
    expect(buildAskCoreAssertion).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cancels a chunked request as soon as its body exceeds the limit', async () => {
    let bodyPulls = 0;
    let bodyCancelled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        cancel() {
          bodyCancelled = true;
        },
        pull(controller) {
          bodyPulls += 1;
          if (bodyPulls > 2) throw new Error('chunked body was read past the limit');
          controller.enqueue(new Uint8Array(700));
        },
      },
      { highWaterMark: 0 },
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('./route');

    const response = await POST(
      new NextRequest('https://askcore.cn/api/askcore/school/session-proof?readiness=1', {
        body,
        headers: {
          'x-askcore-deployment': '9',
          'x-askcore-nonce': 'readiness0123456789abcdef01234567',
          'x-askcore-signature': 'e'.repeat(64),
          'x-askcore-timestamp': '1784426400',
        },
        method: 'POST',
        duplex: 'half',
      } as unknown as ConstructorParameters<typeof NextRequest>[1]),
    );

    expect(response.status).toBe(400);
    expect(bodyPulls).toBe(2);
    expect(bodyCancelled).toBe(true);
    expect(buildAskCoreAssertion).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves a backend conflict while stripping response credentials', async () => {
    authApi.getSession.mockResolvedValue({
      session: { id: 'session-b' },
      user: { email: 'student@example.test', id: 'account-b' },
    });
    buildAskCoreAssertion.mockResolvedValue('signed-current-account');
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ detail: 'actor binding conflict' }), {
          headers: {
            'content-type': 'application/json',
            'location': 'https://must-not-forward.invalid',
            'set-cookie': 'secret=must-not-forward',
          },
          status: 409,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('./route');

    const response = await POST(
      new NextRequest('https://askcore.cn/api/askcore/school/session-proof', {
        body: JSON.stringify({
          actor_binding: 'a'.repeat(64),
          school_subject_hash: 'b'.repeat(64),
        }),
        headers: {
          'x-askcore-deployment': '9',
          'x-askcore-nonce': '0123456789abcdef0123456789abcdef',
          'x-askcore-signature': 'f'.repeat(64),
          'x-askcore-timestamp': '1784426400',
        },
        method: 'POST',
      }),
    );

    expect(response.status).toBe(409);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('cache-control')).toContain('no-store');
    await expect(response.json()).resolves.toEqual({ detail: 'actor binding conflict' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('times out while consuming a stalled upstream response body', async () => {
    vi.useFakeTimers();
    authApi.getSession.mockResolvedValue({
      session: { id: 'session-b' },
      user: { email: 'student@example.test', id: 'account-b' },
    });
    buildAskCoreAssertion.mockResolvedValue('signed-current-account');
    let markFetchStarted: (() => void) | undefined;
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve;
    });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
        },
      });
      markFetchStarted?.();
      return new Response(body, {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('./route');

    const responsePromise = POST(
      new NextRequest('https://askcore.cn/api/askcore/school/session-proof', {
        body: JSON.stringify({
          actor_binding: 'a'.repeat(64),
          school_subject_hash: 'b'.repeat(64),
        }),
        headers: {
          'x-askcore-deployment': '9',
          'x-askcore-nonce': '0123456789abcdef0123456789abcdef',
          'x-askcore-signature': 'f'.repeat(64),
          'x-askcore-timestamp': '1784426400',
        },
        method: 'POST',
      }),
    );
    await fetchStarted;
    await vi.advanceTimersByTimeAsync(3001);
    const response = await responsePromise;

    expect(response.status).toBe(502);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({ detail: 'Actor observation is unavailable' });
  });

  it('rejects an upstream response that is not declared as JSON', async () => {
    authApi.getSession.mockResolvedValue({
      session: { id: 'session-b' },
      user: { email: 'student@example.test', id: 'account-b' },
    });
    buildAskCoreAssertion.mockResolvedValue('signed-current-account');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ state: 'created' }), {
            headers: { 'content-type': 'text/html' },
            status: 200,
          }),
      ),
    );
    const { POST } = await import('./route');

    const response = await POST(
      new NextRequest('https://askcore.cn/api/askcore/school/session-proof', {
        body: JSON.stringify({
          actor_binding: 'a'.repeat(64),
          school_subject_hash: 'b'.repeat(64),
        }),
        headers: {
          'x-askcore-deployment': '9',
          'x-askcore-nonce': '0123456789abcdef0123456789abcdef',
          'x-askcore-signature': 'f'.repeat(64),
          'x-askcore-timestamp': '1784426400',
        },
        method: 'POST',
      }),
    );

    expect(response.status).toBe(502);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({ detail: 'Actor observation is unavailable' });
  });

  it.each([
    ['oversized', JSON.stringify({ detail: 'x'.repeat(5000) })],
    ['malformed', '{not-json'],
  ])('rejects an %s upstream JSON response', async (_case, upstreamBody) => {
    authApi.getSession.mockResolvedValue({
      session: { id: 'session-b' },
      user: { email: 'student@example.test', id: 'account-b' },
    });
    buildAskCoreAssertion.mockResolvedValue('signed-current-account');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(upstreamBody, {
            headers: { 'content-type': 'application/json' },
            status: 200,
          }),
      ),
    );
    const { POST } = await import('./route');

    const response = await POST(
      new NextRequest('https://askcore.cn/api/askcore/school/session-proof', {
        body: JSON.stringify({
          actor_binding: 'a'.repeat(64),
          school_subject_hash: 'b'.repeat(64),
        }),
        headers: {
          'x-askcore-deployment': '9',
          'x-askcore-nonce': '0123456789abcdef0123456789abcdef',
          'x-askcore-signature': 'f'.repeat(64),
          'x-askcore-timestamp': '1784426400',
        },
        method: 'POST',
      }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ detail: 'Actor observation is unavailable' });
  });

  it('rejects missing connector proof and query parameters', async () => {
    authApi.getSession.mockResolvedValue({
      session: { id: 'session-b' },
      user: { email: 'student@example.test', id: 'account-b' },
    });
    const { POST } = await import('./route');
    const missingProof = await POST(
      new NextRequest('https://askcore.cn/api/askcore/school/session-proof', {
        body: '{}',
        method: 'POST',
      }),
    );
    expect(missingProof.status).toBe(401);

    const query = await POST(
      new NextRequest('https://askcore.cn/api/askcore/school/session-proof?actor=forbidden', {
        body: JSON.stringify({
          actor_binding: 'a'.repeat(64),
          school_subject_hash: 'b'.repeat(64),
        }),
        headers: {
          'x-askcore-deployment': '9',
          'x-askcore-nonce': '0123456789abcdef0123456789abcdef',
          'x-askcore-signature': 'f'.repeat(64),
          'x-askcore-timestamp': '1784426400',
        },
        method: 'POST',
      }),
    );
    expect(query.status).toBe(404);
    expect(resolveSchoolOIDCSubject).not.toHaveBeenCalled();
  });
});
