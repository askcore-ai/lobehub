// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const buildAskCoreAssertion = vi.hoisted(() => vi.fn());

vi.mock('@/server/services/askcoreAssertion', () => ({ buildAskCoreAssertion }));

describe('school identity resolver', () => {
  afterEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    const { clearSchoolIdentityCacheForTest } = await import('./schoolIdentity');
    clearSchoolIdentityCacheForTest();
  });

  it('resolves and caches only the pseudonymous subject and link version for 25 seconds', async () => {
    buildAskCoreAssertion.mockResolvedValue('signed-identity-read');
    const fetchMock = vi.fn(async () =>
      Response.json({
        deployment_id: 1,
        identity_link_version: 'a'.repeat(64),
        linked: true,
        school_subject: 'school_0123456789abcdef0123456789abcdef',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('AITUTOR_API_BASE_URL', 'http://api:8000');
    const { resolveSchoolIdentity } = await import('./schoolIdentity');

    const account = { email: 'student@example.test', userId: 'internal-account-a' };
    const first = await resolveSchoolIdentity(account, 1000);
    const cached = await resolveSchoolIdentity(account, 25_999);
    const refreshed = await resolveSchoolIdentity(account, 26_000);

    expect(first).toEqual({
      identityLinkVersion: 'a'.repeat(64),
      schoolSubject: 'school_0123456789abcdef0123456789abcdef',
    });
    expect(cached).toEqual(first);
    expect(refreshed).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(buildAskCoreAssertion).toHaveBeenCalledWith({
      email: 'student@example.test',
      scopes: ['school.identity.read'],
      sub: 'internal-account-a',
    });
  });

  it('evicts failed resolutions and rejects malformed source identity data', async () => {
    buildAskCoreAssertion.mockResolvedValue('signed-identity-read');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          deployment_id: 1,
          identity_link_version: 'not-a-digest',
          school_subject: 'bad',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { resolveSchoolIdentity } = await import('./schoolIdentity');

    await expect(resolveSchoolIdentity({ userId: 'account-a' }, 1000)).rejects.toThrow(
      'school subject resolution failed',
    );
    await expect(resolveSchoolIdentity({ userId: 'account-a' }, 1001)).rejects.toThrow(
      'invalid response',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
