// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from './route';

const routeContext = (route: string[]) => ({ params: Promise.resolve({ route }) });
const signatureHeaders = {
  'content-type': 'application/json',
  'x-askcore-deployment': '17',
  'x-askcore-nonce': '00112233445566778899aabbccddeeff',
  'x-askcore-signature': 'a'.repeat(64),
  'x-askcore-timestamp': '1783760400',
};

const requestFor = (
  method: 'GET' | 'POST',
  path: string,
  headers: HeadersInit = signatureHeaders,
) =>
  new NextRequest(`https://askcore.cn/api/lms-connectors/${path}`, {
    body: method === 'POST' ? '{}' : undefined,
    headers,
    method,
  });

const callProxy = (method: 'GET' | 'POST', path: string, headers?: HeadersInit) => {
  const route = path.split('/');
  const request = requestFor(method, path, headers);
  return (method === 'GET' ? GET : POST)(request, routeContext(route));
};

const allowedRoutes: Array<['GET' | 'POST', string]> = [
  ['POST', 'v2/processing/reference-runs'],
  ['POST', 'v2/processing/submission-runs'],
  ['POST', 'v2/processing/candidate-scopes'],
  ['POST', 'v2/processing/batch-runs'],
  ['POST', 'v2/processing/capture-runs'],
  ['POST', 'v2/processing/runs/status'],
  ['POST', 'v2/processing/runs/44/seal'],
  ['POST', 'v2/processing/runs/44/launch-token'],
  ['POST', 'v2/processing/batch-runs/800/items/rematch'],
  ['POST', 'v2/processing/captures/receipts/manifest'],
  ['POST', 'v2/processing/captures/receipts/ack'],
  ['POST', 'v2/processing/captures/receipts/pages/1/download'],
  ['GET', 'v2/processing/runs/44'],
  ['GET', 'v2/processing/runs/44/report'],
  ['GET', 'v2/processing/batch-runs/800/items/3/manifest'],
  ['GET', 'v2/processing/batch-runs/800/items/3/pages/1'],
];

describe('AskCore LMS connector proxy', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each(allowedRoutes)('forwards the exact %s %s connector route', async (method, path) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('upstream', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await callProxy(method, path);

    expect(response.status).toBe(202);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [target, init] = fetchMock.mock.calls[0] as [URL, RequestInit & { duplex?: string }];
    expect(target.toString()).toBe(`http://api:8000/api/lms-connectors/${path}`);
    expect(init.method).toBe(method);
    expect(init.redirect).toBe('manual');
    expect(init.cache).toBe('no-store');
    if (method === 'POST') {
      expect(init.body).toBeInstanceOf(ReadableStream);
      expect(init.duplex).toBe('half');
    } else {
      expect(init.body).toBeUndefined();
      expect(init.duplex).toBeUndefined();
    }
  });

  it.each([
    'v2/processing/reference-runs',
    'v2/processing/submission-runs',
    'v2/processing/batch-runs',
  ])('forwards Idempotency-Key for %s without browser credentials', async (path) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ run_id: 71, state: 'queued' }, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const headers = {
      ...signatureHeaders,
      'authorization': 'Bearer must-not-forward',
      'cookie': 'better-auth.session=must-not-forward',
      'idempotency-key': `moodle:${path}:71`,
      'x-askcore-billing-assertion': 'must-not-forward',
    };

    const response = await callProxy('POST', path, headers);

    expect(response.status).toBe(201);
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const forwarded = init.headers as Headers;
    expect(forwarded.get('idempotency-key')).toBe(`moodle:${path}:71`);
    expect(forwarded.get('x-askcore-deployment')).toBe('17');
    expect(forwarded.get('authorization')).toBeNull();
    expect(forwarded.get('cookie')).toBeNull();
    expect(forwarded.get('x-askcore-billing-assertion')).toBeNull();
  });

  it.each([
    ['POST', 'v2/processing/captures/receipts/pages/1/download'],
    ['GET', 'v2/processing/batch-runs/800/items/3/pages/1'],
  ] as const)('streams integrity headers for %s %s binary responses', async (method, path) => {
    const upstreamHeaders = new Headers({
      'cache-control': 'private, no-store',
      'content-length': '4',
      'content-type': 'image/jpeg',
      'location': 'https://must-not-leak.invalid',
      'set-cookie': 'private=blocked',
      'x-askcore-content-sha256': 'b'.repeat(64),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3, 4]), {
          headers: upstreamHeaders,
          status: 200,
        }),
      ),
    );

    const response = await callProxy(method, path);

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-length')).toBe('4');
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('x-askcore-content-sha256')).toBe('b'.repeat(64));
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('streams only the report response headers needed by Moodle', async () => {
    const upstreamHeaders = new Headers({
      'content-disposition': 'attachment; filename="feedback.pdf"',
      'content-length': '8',
      'content-type': 'application/pdf',
      'location': 'https://must-not-leak.invalid',
      'set-cookie': 'private=blocked',
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('%PDF-1.7', { headers: upstreamHeaders, status: 200 })),
    );

    const response = await callProxy('GET', 'v2/processing/runs/71/report');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain('feedback.pdf');
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it.each([
    ['GET', 'v2/processing/reference-runs'],
    ['GET', 'v2/processing/submission-runs'],
    ['GET', 'v2/processing/candidate-scopes'],
    ['GET', 'v2/processing/batch-runs'],
    ['GET', 'v2/processing/capture-runs'],
    ['GET', 'v2/processing/runs/status'],
    ['GET', 'v2/processing/runs/44/seal'],
    ['GET', 'v2/processing/runs/44/launch-token'],
    ['GET', 'v2/processing/batch-runs/800/items/rematch'],
    ['GET', 'v2/processing/captures/receipts/manifest'],
    ['GET', 'v2/processing/captures/receipts/ack'],
    ['GET', 'v2/processing/captures/receipts/pages/1/download'],
    ['POST', 'v2/processing/runs/44'],
    ['POST', 'v2/processing/runs/44/report'],
    ['POST', 'v2/processing/batch-runs/800/items/3/manifest'],
    ['POST', 'v2/processing/batch-runs/800/items/3/pages/1'],
  ] as const)('rejects the method-swapped %s %s route before fetch', async (method, path) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await callProxy(method, path);

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'v1/processing/runs',
    'v1/processing/runs/71/report',
    'reference-runs',
    'v2/processing/runs',
    'v2/processing/runs/0',
    'v2/processing/runs/01',
    'v2/processing/runs/-1',
    'v2/processing/runs/1.0',
    'v2/processing/runs/1/extra',
    'v2/processing/batch-runs/1/items/1/pages/1/extra',
    'v2/processing/captures/receipts/pages/1',
    'v2/processing/actor-observations',
    'v2/processing/actor-observations/readiness',
    'v2/integrations',
  ])('rejects the unavailable POST %s path before signature validation', async (path) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await callProxy('POST', path, {
      ...signatureHeaders,
      'cookie': 'better-auth.session=must-not-forward',
      'x-askcore-billing-assertion': 'forged-assertion',
    });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['v2', 'processing', 'runs', '..'],
    ['v2', 'processing', 'runs', '1/2'],
    ['v2', 'processing', 'runs', '1\\2'],
    ['v2', 'processing', 'runs', '1\n2'],
  ])('rejects malformed route segments before fetch', async (...route) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const request = requestFor('GET', 'v2/processing/runs/1');

    const response = await GET(request, routeContext(route));

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'x-askcore-deployment',
    'x-askcore-nonce',
    'x-askcore-signature',
    'x-askcore-timestamp',
  ])('rejects an allowed route without %s', async (missingHeader) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const headers = new Headers(signatureHeaders);
    headers.delete(missingHeader);

    const response = await callProxy('POST', 'v2/processing/reference-runs', headers);

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects query strings before upstream access', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const request = new NextRequest(
      'https://askcore.cn/api/lms-connectors/v2/processing/runs/71?actor=1',
      { headers: signatureHeaders },
    );

    const response = await GET(request, routeContext(['v2', 'processing', 'runs', '71']));

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 502 when the connector authority cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));

    const response = await callProxy('GET', 'v2/processing/runs/71');

    expect(response.status).toBe(502);
  });

  it('does not follow or expose upstream redirects', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('redirect', {
        headers: { location: 'https://must-not-leak.invalid' },
        status: 302,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await callProxy('GET', 'v2/processing/runs/71');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBeNull();
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(init.redirect).toBe('manual');
  });
});
