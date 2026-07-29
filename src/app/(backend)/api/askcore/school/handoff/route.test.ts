// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const allowed = vi.hoisted(() => vi.fn(() => true));
const createSourceHandoff = vi.hoisted(() => vi.fn());
const SchoolSessionRequiredError = vi.hoisted(
  () =>
    class extends Error {
      constructor() {
        super('school session is required');
        this.name = 'SchoolSessionRequiredError';
      }
    },
);
const translation = vi.hoisted(() =>
  vi.fn(async (_namespace: string, locale: string) => ({
    locale,
    t: (key: string) =>
      ({
        'schoolPortal.connection.refresh': 'Try again',
        'schoolPortal.connection.unavailable': 'School connection unavailable',
      })[key] || key,
  })),
);

vi.mock('@/server/services/askcoreAssertion', () => ({
  isAllowedAskCoreSameOriginWrite: allowed,
}));
vi.mock('@/server/services/schoolSessionBroker', () => ({
  createSourceHandoff,
  SchoolSessionRequiredError,
}));
vi.mock('@/server/translation', () => ({ translation }));

const request = (body = 'source=moodle', headers: Record<string, string> = {}) =>
  new NextRequest('https://askcore.cn/api/askcore/school/handoff', {
    body,
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'https://askcore.cn',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      ...headers,
    },
    method: 'POST',
  });

const expectPreparationError = async (response: Response, status: number) => {
  expect(response.status).toBe(status);
  expect(response.headers.get('content-type')).toContain('application/json');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  await expect(response.json()).resolves.toEqual({ error: 'handoff_unavailable' });
};

describe('school source handoff preparation route', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns only a no-store fixed Moodle action and one-time grant', async () => {
    createSourceHandoff.mockResolvedValue({
      action: '/school/teaching/local/askcore/handoff.php',
      expiresAt: 1_800_000_030,
      grant: 'header.payload.signature',
    });
    const { POST } = await import('./route');
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({
      action: '/school/teaching/local/askcore/handoff.php',
      grant: 'header.payload.signature',
    });
    expect(createSourceHandoff).toHaveBeenCalledWith(expect.any(Headers), 'moodle');
  });

  it('returns only the fixed Gibbon action for School Affairs', async () => {
    createSourceHandoff.mockResolvedValue({
      action: '/school/services/askcore/handoff.php',
      expiresAt: 1_800_000_030,
      grant: 'header.payload.signature',
    });
    const { POST } = await import('./route');
    const response = await POST(request('source=gibbon'));

    await expect(response.json()).resolves.toEqual({
      action: '/school/services/askcore/handoff.php',
      grant: 'header.payload.signature',
    });
    expect(createSourceHandoff).toHaveBeenCalledWith(expect.any(Headers), 'gibbon');
  });

  it('fails closed when the Broker returns a non-fixed action or invalid grant', async () => {
    createSourceHandoff
      .mockResolvedValueOnce({
        action: '//attacker.invalid/handoff',
        expiresAt: 1_800_000_030,
        grant: 'header.payload.signature',
      })
      .mockResolvedValueOnce({
        action: '/school/teaching/local/askcore/handoff.php',
        expiresAt: 1_800_000_030,
        grant: '',
      })
      .mockResolvedValueOnce({
        action: '/school/teaching/local/askcore/handoff.php',
        expiresAt: 1_800_000_030,
        grant: 'not-a-jwt',
      })
      .mockResolvedValueOnce({
        action: '/school/teaching/local/askcore/handoff.php',
        expiresAt: 1_800_000_030,
        grant: `header.payload.${'x'.repeat(8192)}`,
      });
    const { POST } = await import('./route');

    await expectPreparationError(await POST(request()), 503);
    await expectPreparationError(await POST(request()), 503);
    await expectPreparationError(await POST(request()), 503);
    await expectPreparationError(await POST(request()), 503);
  });

  it('rejects cross-origin, navigation, incomplete metadata, and unknown-source requests', async () => {
    const { POST } = await import('./route');
    allowed.mockReturnValueOnce(false);
    await expectPreparationError(await POST(request()), 403);
    await expectPreparationError(await POST(request('source=moodle', { origin: '' })), 403);
    await expectPreparationError(
      await POST(request('source=moodle', { 'sec-fetch-site': '' })),
      403,
    );
    await expectPreparationError(
      await POST(
        request('source=moodle', {
          'sec-fetch-dest': 'document',
          'sec-fetch-mode': 'navigate',
        }),
      ),
      403,
    );
    await expectPreparationError(
      await POST(request('source=moodle', { accept: 'text/html' })),
      403,
    );
    await expectPreparationError(await POST(request('source=unknown')), 400);
    expect(createSourceHandoff).not.toHaveBeenCalled();
  });

  it('bounds the actual body when content-length is missing or the request is chunked', async () => {
    const { POST } = await import('./route');
    const oversized = request(`source=moodle&padding=${'x'.repeat(256)}`);
    oversized.headers.delete('content-length');
    await expectPreparationError(await POST(oversized), 413);

    const headers = {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'https://askcore.cn',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'transfer-encoding': 'chunked',
    };
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('source=moodle&padding='));
        controller.enqueue(new TextEncoder().encode('x'.repeat(256)));
        controller.close();
      },
    });
    const chunked = new NextRequest(
      'https://askcore.cn/api/askcore/school/handoff',
      { body: stream, headers, method: 'POST' } as never,
    );
    await expectPreparationError(await POST(chunked), 413);
    expect(createSourceHandoff).not.toHaveBeenCalled();
  });

  it('rejects oversized declared bodies before consuming them', async () => {
    const { POST } = await import('./route');
    await expectPreparationError(
      await POST(request('source=moodle', { 'content-length': '129' })),
      413,
    );
    expect(createSourceHandoff).not.toHaveBeenCalled();
  });

  it('returns generic 401 and 503 JSON without identity diagnostics', async () => {
    const { POST } = await import('./route');
    createSourceHandoff
      .mockRejectedValueOnce(new SchoolSessionRequiredError())
      .mockRejectedValueOnce(new Error('broker unavailable'));

    await expectPreparationError(await POST(request()), 401);
    await expectPreparationError(await POST(request('source=gibbon')), 503);
  });

  it('keeps GET as a localized accessible recovery document', async () => {
    const { GET } = await import('./route');
    const response = await GET(request());
    const html = await response.text();

    expect(response.status).toBe(405);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(html).toContain('data-askcore-handoff-error');
    expect(html).toContain('role="alert"');
    expect(html).toContain('href="/school"');
  });
});
