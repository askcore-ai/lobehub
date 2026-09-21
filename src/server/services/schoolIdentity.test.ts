// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const buildAskCoreAssertion = vi.hoisted(() => vi.fn());
vi.mock('@/server/services/askcoreAssertion', () => ({ buildAskCoreAssertion }));

const payload = (version = 'a') => ({
  deployment_id: 1,
  identity_link_version: version.repeat(64),
  school_subject: 'school_0123456789abcdef0123456789abcdef',
});

describe('school identity resolver', () => {
  afterEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    const { clearSchoolIdentityCacheForTest } = await import('./schoolIdentity');
    clearSchoolIdentityCacheForTest();
  });

  it('reads the fresh identity version immediately after a completed resolution', async () => {
    buildAskCoreAssertion.mockResolvedValue('signed-identity-read');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(payload('a')))
      .mockResolvedValueOnce(Response.json(payload('b')));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('AITUTOR_API_BASE_URL', 'http://api:8000');
    const { resolveSchoolIdentity } = await import('./schoolIdentity');
    const account = { email: 'student@example.test', userId: 'account-a' };
    expect(await resolveSchoolIdentity(account)).toEqual({
      identityLinkVersion: 'a'.repeat(64), schoolSubject: payload().school_subject,
    });
    expect(await resolveSchoolIdentity(account)).toEqual({
      identityLinkVersion: 'b'.repeat(64), schoolSubject: payload().school_subject,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(buildAskCoreAssertion).toHaveBeenCalledWith({
      email: account.email, scopes: ['school.identity.read'], sub: account.userId,
    });
  });

  it('coalesces only in-flight requests for the same account', async () => {
    buildAskCoreAssertion.mockResolvedValue('signed-identity-read');
    let release!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { release = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const { resolveSchoolIdentity } = await import('./schoolIdentity');
    const first = resolveSchoolIdentity({ userId: 'account-a' });
    const second = resolveSchoolIdentity({ userId: 'account-a' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    release(Response.json(payload()));
    expect(await first).toEqual(await second);
  });

  it('keeps overlapping account switches separate', async () => {
    buildAskCoreAssertion.mockResolvedValue('signed-identity-read');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(payload('a')))
      .mockResolvedValueOnce(Response.json(payload('b')));
    vi.stubGlobal('fetch', fetchMock);
    const { resolveSchoolIdentity } = await import('./schoolIdentity');
    const [first, switched] = await Promise.all([
      resolveSchoolIdentity({ userId: 'account-a' }),
      resolveSchoolIdentity({ userId: 'account-b' }),
    ]);
    expect(first.identityLinkVersion).toBe('a'.repeat(64));
    expect(switched.identityLinkVersion).toBe('b'.repeat(64));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('evicts failures so the next call can recover without a stale rejection', async () => {
    buildAskCoreAssertion.mockResolvedValue('signed-identity-read');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(Response.json(payload('b')));
    vi.stubGlobal('fetch', fetchMock);
    const { resolveSchoolIdentity } = await import('./schoolIdentity');
    await expect(resolveSchoolIdentity({ userId: 'account-a' })).rejects.toThrow(
      'school subject resolution failed',
    );
    expect((await resolveSchoolIdentity({ userId: 'account-a' })).identityLinkVersion).toBe('b'.repeat(64));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed source identity data', async () => {
    buildAskCoreAssertion.mockResolvedValue('signed-identity-read');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      deployment_id: 1, identity_link_version: 'invalid', school_subject: 'bad',
    })));
    const { resolveSchoolIdentity } = await import('./schoolIdentity');
    await expect(resolveSchoolIdentity({ userId: 'account-a' })).rejects.toThrow('invalid response');
  });
});
