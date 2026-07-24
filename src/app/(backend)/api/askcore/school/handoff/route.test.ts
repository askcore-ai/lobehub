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
        'schoolPortal.handoff.gibbon.continue': 'Continue to School Affairs',
        'schoolPortal.handoff.gibbon.message': 'Verifying Gibbon session',
        'schoolPortal.handoff.gibbon.title': 'Entering School Affairs',
        'schoolPortal.handoff.moodle.continue': 'Continue to School / Learning Space',
        'schoolPortal.handoff.moodle.message': 'Verifying Moodle session',
        'schoolPortal.handoff.moodle.title': 'Entering School / Learning Space',
        'schoolPortal.connection.refresh': 'Try again',
        'schoolPortal.connection.unavailable': 'School connection unavailable',
        'schoolPortal.identity.denied': 'Sign in to continue',
        'schoolPortal.state.unavailable.message': 'The school service could not be reached.',
        'schoolPortal.state.unavailable.title': 'School service unavailable',
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
      'content-type': 'application/x-www-form-urlencoded',
      'origin': 'https://askcore.cn',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'same-origin',
      ...headers,
    },
    method: 'POST',
  });

const expectFailureDocument = async (
  response: Response,
  status: number,
  recoveryHref = '/school',
) => {
  const html = await response.text();
  expect(response.status).toBe(status);
  expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
  expect(html).toContain(`<main data-askcore-handoff-error data-status="${status}">`);
  expect(html).toContain('role="alert"');
  expect(html).toContain(`href="${recoveryHref}"`);
  expect(html).not.toContain('{"detail":');
};

describe('school source handoff route', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns a no-store CSP-constrained auto-POST document', async () => {
    createSourceHandoff.mockResolvedValue({
      action: '/school/teaching/local/askcore/handoff.php',
      expiresAt: 1_800_000_030,
      grant: 'header.payload.signature',
    });
    const { POST } = await import('./route');
    const response = await POST(request());
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('content-security-policy')).toContain("form-action 'self'");
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(html).toContain('method="post"');
    expect(html).toContain('action="/school/teaching/local/askcore/handoff.php"');
    expect(html).toContain('value="header.payload.signature"');
    expect(html).toContain('Entering School / Learning Space');
    expect(html).toContain('Verifying Moodle session');
    expect(createSourceHandoff).toHaveBeenCalledWith(expect.any(Headers), 'moodle');
  });

  it('labels the Settings handoff as school affairs for Gibbon', async () => {
    createSourceHandoff.mockResolvedValue({
      action: '/school/services/askcore/handoff.php',
      expiresAt: 1_800_000_030,
      grant: 'header.payload.signature',
    });
    const { POST } = await import('./route');
    const response = await POST(request('source=gibbon', { 'accept-language': 'en-US,en;q=0.9' }));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<html lang="en-US">');
    expect(html).toContain('Entering School Affairs');
    expect(html).toContain('Continue to School Affairs');
    expect(html).toContain('action="/school/services/askcore/handoff.php"');
    expect(translation).toHaveBeenCalledWith('common', 'en-US');
    expect(createSourceHandoff).toHaveBeenCalledWith(expect.any(Headers), 'gibbon');
  });

  it('uses one escaping policy for the successful handoff document', async () => {
    createSourceHandoff.mockResolvedValue({
      action: '//attacker.invalid/handoff',
      expiresAt: 1_800_000_030,
      grant: 'grant"><img src=x onerror=alert(1)>',
    });
    translation.mockResolvedValueOnce({
      locale: 'en-US"><script>alert(1)</script>',
      t: (key: string) => `<img data-key="${key}" onerror="alert(1)">`,
    });
    const { POST } = await import('./route');
    const response = await POST(request());
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('action="/school"');
    expect(html).toContain('grant&quot;>&lt;img');
    expect(html).toContain('&lt;img data-key=');
    expect(html).not.toContain('//attacker.invalid');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('rejects cross-origin, incomplete metadata, non-navigation, and unknown-source requests', async () => {
    const { POST } = await import('./route');
    allowed.mockReturnValueOnce(false);
    expect((await POST(request())).status).toBe(403);
    expect((await POST(request('source=moodle', { origin: '' }))).status).toBe(403);
    expect((await POST(request('source=moodle', { 'sec-fetch-site': '' }))).status).toBe(403);
    expect((await POST(request('source=moodle', { 'sec-fetch-mode': 'cors' }))).status).toBe(403);
    expect((await POST(request('source=moodle', { 'sec-fetch-dest': 'iframe' }))).status).toBe(403);
    expect((await POST(request('source=unknown'))).status).toBe(400);
    expect(createSourceHandoff).not.toHaveBeenCalled();
  });

  it('bounds the actual body when content-length is missing or the request is chunked', async () => {
    const { POST } = await import('./route');
    const oversized = request(`source=moodle&padding=${'x'.repeat(256)}`);
    oversized.headers.delete('content-length');
    expect((await POST(oversized)).status).toBe(413);

    const headers = {
      'content-type': 'application/x-www-form-urlencoded',
      'origin': 'https://askcore.cn',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
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
    expect((await POST(chunked)).status).toBe(413);
    expect(createSourceHandoff).not.toHaveBeenCalled();
  });

  it('rejects an oversized declared body before consuming it', async () => {
    const { POST } = await import('./route');
    expect((await POST(request('source=moodle', { 'content-length': '129' }))).status).toBe(413);
    expect(createSourceHandoff).not.toHaveBeenCalled();
  });

  it('returns 401 when the Better Auth session is missing', async () => {
    createSourceHandoff.mockRejectedValueOnce(new SchoolSessionRequiredError());
    const { POST } = await import('./route');

    await expectFailureDocument(
      await POST(request('source=moodle', { 'accept-language': 'zh-CN,zh;q=0.9' })),
      401,
    );
    expect(translation).toHaveBeenCalledWith('common', 'zh-CN');
  });

  it('returns localized accessible recovery documents for forbidden, oversized, and unavailable handoffs', async () => {
    const { POST } = await import('./route');

    allowed.mockReturnValueOnce(false);
    await expectFailureDocument(await POST(request()), 403);
    await expectFailureDocument(
      await POST(request('source=moodle', { 'content-length': '129' })),
      413,
    );
    createSourceHandoff.mockRejectedValueOnce(new Error('broker unavailable'));
    await expectFailureDocument(
      await POST(request('source=gibbon')),
      503,
      '/settings/school-affairs',
    );
  });

  it('does not accept GET handoff', async () => {
    const { GET } = await import('./route');
    await expectFailureDocument(await GET(request()), 405);
  });
});
