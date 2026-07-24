// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const createSourceAccessProof = vi.hoisted(() => vi.fn());

class TestSchoolSessionRequiredError extends Error {}

vi.mock('@/server/services/schoolSessionBroker', () => ({
  createSourceAccessProof,
  SchoolSessionRequiredError: TestSchoolSessionRequiredError,
}));

describe('internal school source access proof', () => {
  afterEach(() => vi.clearAllMocks());

  const request = (source: string, extra: Record<string, string> = {}) =>
    new NextRequest('https://askcore.cn/api/askcore/school/source-access', {
      headers: {
        cookie: 'better-auth.session_token=opaque',
        'x-askcore-internal-request': '1',
        'x-askcore-school-source': source,
        ...extra,
      },
    });

  it.each(['moodle', 'gibbon'] as const)(
    'returns a no-store proof only to the internal %s verifier',
    async (source) => {
      createSourceAccessProof.mockResolvedValue({ expiresAt: 1784426405, proof: 'signed-proof' });
      const { GET } = await import('./route');

      const response = await GET(request(source));

      expect(response.status).toBe(204);
      expect(response.headers.get('x-askcore-source-proof')).toBe('signed-proof');
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(createSourceAccessProof).toHaveBeenCalledWith(expect.any(Headers), source);
    },
  );

  it('hides public, queried, malformed, and forged-source requests', async () => {
    const { GET } = await import('./route');
    const requests = [
      new NextRequest('https://askcore.cn/api/askcore/school/source-access'),
      new NextRequest('https://askcore.cn/api/askcore/school/source-access?source=moodle', {
        headers: { 'x-askcore-internal-request': '1', 'x-askcore-school-source': 'moodle' },
      }),
      request('unknown'),
      request('moodle', { 'x-askcore-internal-request': '0' }),
    ];
    for (const candidate of requests) expect((await GET(candidate)).status).toBe(404);
    expect(createSourceAccessProof).not.toHaveBeenCalled();
  });

  it('distinguishes missing account session from broker unavailability without leaking details', async () => {
    const { GET } = await import('./route');
    createSourceAccessProof.mockRejectedValueOnce(new TestSchoolSessionRequiredError());
    const unauthenticated = await GET(request('moodle'));
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get('x-askcore-source-proof')).toBeNull();

    createSourceAccessProof.mockRejectedValueOnce(new Error('private detail'));
    const unavailable = await GET(request('moodle'));
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get('x-askcore-source-proof')).toBeNull();
  });
});
