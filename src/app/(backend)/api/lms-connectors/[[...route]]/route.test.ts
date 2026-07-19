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

describe('AskCore LMS connector proxy', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('streams an HMAC-authenticated package without browser credentials', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ run_id: 71, state: 'waiting_input', uploads: [] }, { status: 201 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const request = new NextRequest('https://askcore.cn/api/lms-connectors/v1/processing/runs', {
      body: JSON.stringify({ inputs: [], processing_options: {} }),
      headers: {
        ...signatureHeaders,
        authorization: 'Bearer must-not-forward',
        cookie: 'better-auth.session=must-not-forward',
      },
      method: 'POST',
    });

    const response = await POST(request, routeContext(['v1', 'processing', 'runs']));

    expect(response.status).toBe(201);
    const [target, init] = fetchMock.mock.calls[0] as [URL, RequestInit & { duplex?: string }];
    expect(target.toString()).toBe('http://api:8000/api/lms-connectors/v1/processing/runs');
    expect(init.body).toBe(request.body);
    expect(init.duplex).toBe('half');
    const headers = init.headers as Headers;
    expect(headers.get('x-askcore-deployment')).toBe('17');
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('cookie')).toBeNull();
  });

  it('streams only the report response headers needed by Moodle', async () => {
    const upstreamHeaders = new Headers({
      'content-disposition': 'attachment; filename="feedback.pdf"',
      'content-length': '8',
      'content-type': 'application/pdf',
      'set-cookie': 'private=blocked',
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('%PDF-1.7', { headers: upstreamHeaders, status: 200 })),
    );

    const response = await GET(
      new NextRequest('https://askcore.cn/api/lms-connectors/v1/processing/runs/71/report', {
        headers: signatureHeaders,
      }),
      routeContext(['v1', 'processing', 'runs', '71', 'report']),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain('feedback.pdf');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('fails before upstream access for unsigned, malformed, or unrelated paths', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const unsigned = await POST(
      new NextRequest('https://askcore.cn/api/lms-connectors/v1/processing/runs', {
        body: '{}',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
      routeContext(['v1', 'processing', 'runs']),
    );
    const unrelated = await GET(
      new NextRequest('https://askcore.cn/api/lms-connectors/v1/integrations'),
      routeContext(['v1', 'integrations']),
    );
    const query = await GET(
      new NextRequest('https://askcore.cn/api/lms-connectors/v1/processing/runs/71?actor=1', {
        headers: signatureHeaders,
      }),
      routeContext(['v1', 'processing', 'runs', '71']),
    );

    expect(unsigned.status).toBe(401);
    expect(unrelated.status).toBe(404);
    expect(query.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
