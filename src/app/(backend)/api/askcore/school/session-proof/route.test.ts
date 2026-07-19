// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const authApi = vi.hoisted(() => ({ getSession: vi.fn() }));
const resolveSchoolOIDCSubject = vi.hoisted(() => vi.fn());

vi.mock('@/server/services/askcoreAssertion', () => ({
  getAskCoreAssertionAuthApi: vi.fn(async () => authApi),
}));
vi.mock('@/libs/oidc-provider/provider', () => ({ resolveSchoolOIDCSubject }));

describe('AskCore school current-session proof', () => {
  afterEach(() => vi.clearAllMocks());

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
    const { GET } = await import('./route');

    const response = await GET(
      new NextRequest('https://askcore.cn/api/askcore/school/session-proof'),
    );

    expect(response.status).toBe(401);
    expect(resolveSchoolOIDCSubject).not.toHaveBeenCalled();
  });
});
