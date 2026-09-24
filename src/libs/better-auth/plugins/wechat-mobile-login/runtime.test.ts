// @vitest-environment node
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { wechatMobileLogin, type WechatMobileLoginOptions } from '.';

const bridge = require('../../../../../apps/wechat-login-bridge/controllers/login-controller');

const origin = 'https://askcore.example';
const providerIdentity = {
  openid: 'synthetic-mini-openid',
  session_key: 'synthetic-provider-session-key',
  unionid: 'synthetic-canonical-unionid',
};

const cookieHeader = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');

function fixture() {
  const database: Record<string, Record<string, unknown>[]> = {
    account: [],
    session: [],
    user: [],
    verification: [],
    wechatMobileLoginTransaction: [],
    wechatRebindClaim: [],
  };
  let nextId = 0;
  const options: WechatMobileLoginOptions = {
    appId: 'synthetic-website', appSecret: 'synthetic-mini-secret', appURL: origin,
    identityMode: 'canonical', miniProgramAppId: 'synthetic-mini', mobileLoginEnabled: true,
    rebindEnabled: true, recoverySeconds: 60, schemePath: 'pages/login/index',
    transactionTtlSeconds: 300, websiteAppSecret: 'synthetic-website-secret',
  };
  const auth = betterAuth({
    advanced: { database: { generateId: () => `framework_${++nextId}` } },
    baseURL: origin,
    database: memoryAdapter(database),
    logger: { disabled: true },
    plugins: [
      wechatMobileLogin(options),
    ],
    rateLimit: { enabled: false },
    secret: 'synthetic-framework-test-secret-at-least-32-characters',
    trustedOrigins: [origin],
  });

  const request = (
    path: string,
    { body, cookie, tab }: { body?: unknown; cookie?: string; tab?: string } = {},
  ) => {
    const headers = new Headers({ origin });
    if (body !== undefined) headers.set('content-type', 'application/json');
    if (cookie) headers.set('cookie', cookie);
    if (tab) headers.set('x-askcore-wechat-tab-binding', tab);
    return auth.handler(
      new Request(`${origin}/api/auth${path}`, {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers,
        method: body === undefined ? 'GET' : 'POST',
      }),
    );
  };

  const start = async (path = '/wechat-mobile/start', cookie?: string) => {
    const response = await request(path, {
      body: path.includes('rebind') ? { channel: 'mobile' } : { callbackURL: '/chat?from=wechat' },
      cookie,
    });
    expect(response.status).toBe(200);
    const prepared = await response.json();
    const query = new URLSearchParams(new URL(prepared.openTarget).searchParams.get('query')!);
    // Run the uploaded bridge's actual parser against the real framework response.
    const launch = bridge.parseLaunchOptions(Object.fromEntries(query));
    expect(launch.transactionId).toBe(prepared.transactionId);
    expect(database.wechatMobileLoginTransaction.at(-1)?.id).toBe(prepared.transactionId);
    return { ...prepared, cookie: cookieHeader(response), launch };
  };

  const prove = (prepared: Awaited<ReturnType<typeof start>>) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      expect(new URL(String(input)).origin).toBe('https://api.weixin.qq.com');
      return Response.json(providerIdentity);
    });
    // wx.request sends no browser cookies or Origin header.
    return auth.handler(
      new Request(`${origin}${bridge.endpointForPurpose(prepared.launch.purpose)}`, {
        body: JSON.stringify({
          code: 'synthetic-one-time-code',
          completionCapability: prepared.launch.completionCapability,
          transactionId: prepared.transactionId,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    );
  };

  const signIn = async () => {
    const prepared = await start();
    const authorized = await prove(prepared);
    expect(await authorized.json()).toEqual({ state: 'authorized' });
    expect(authorized.status).toBe(200);
    const consumed = await request('/wechat-mobile/consume', {
      body: { confirmAccountSwitch: false, transactionId: prepared.transactionId },
      cookie: prepared.cookie,
      tab: prepared.tabBinding,
    });
    expect(await consumed.json()).toEqual({ redirectTo: '/chat?from=wechat' });
    expect(consumed.status).toBe(200);
    return { cookie: cookieHeader(consumed), prepared };
  };

  const startManual = async () => {
    const signedIn = await signIn();
    const response = await request('/wechat-prepublication/start', { body: {}, cookie: signedIn.cookie });
    expect(response.status).toBe(200);
    const data = await response.json();
    return {
      ...data,
      browser: { body: { transactionId: data.transactionId }, cookie: `${signedIn.cookie}; ${cookieHeader(response)}`, tab: data.tabBinding },
      sessionCookie: signedIn.cookie,
    };
  };
  const proveManual = (manualCode: string) => auth.handler(new Request(`${origin}/api/auth/wechat-prepublication/prove`, {
    body: JSON.stringify({ code: 'synthetic-code', manualCode }),
    headers: { 'content-type': 'application/json' }, method: 'POST',
  }));
  return { auth, database, options, prove, proveManual, request, signIn, start, startManual };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('WeChat bridge through the real Better Auth handler and adapter factory', () => {
  it('finishes a real-handler manual exchange in Release A without identity or session writes', async () => {
    const f = fixture();
    const prepared = await f.startManual();
    f.options.mobileLoginEnabled = false;
    f.options.identityMode = 'legacy';
    const before = structuredClone({ accounts: f.database.account, sessions: f.database.session, users: f.database.user, claims: f.database.wechatRebindClaim });
    expect(prepared.manualCode).toMatch(/^[A-F0-9]{20}$/);
    expect(JSON.stringify(f.database)).not.toContain(prepared.manualCode);
    expect((await f.proveManual(prepared.manualCode)).status).toBe(200);
    expect((await f.proveManual(prepared.manualCode)).status).toBe(404);
    expect(await (await f.request('/wechat-prepublication/status', prepared.browser)).json()).toEqual({ state: 'proof_ready' });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await f.request('/wechat-prepublication/finish', prepared.browser);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ state: 'completed' });
      expect(cookieHeader(response)).not.toContain('session_token=');
      expect(response.headers.get('cache-control')).toContain('no-store');
    }
    expect({ accounts: f.database.account, sessions: f.database.session, users: f.database.user, claims: f.database.wechatRebindClaim }).toEqual(before);
    const row = f.database.wechatMobileLoginTransaction.find((item) => item.id === prepared.transactionId)!;
    expect(row).toMatchObject({
      authorizedUserId: null, issuedSessionId: null, purpose: 'prepublication',
      rebindAccountRowId: null, recoveryUntil: null, state: 'completed',
    });
    expect(JSON.stringify(row)).not.toMatch(/synthetic-native-code|synthetic-mini-openid|synthetic-canonical-unionid|synthetic-provider-session-key/);
  });

  it('keeps manual credentials out of every ordinary login/rebind route', async () => {
    const f = fixture();
    const prepared = await f.startManual();
    expect((await f.proveManual(prepared.manualCode)).status).toBe(200);
    const before = structuredClone({ accounts: f.database.account, sessions: f.database.session, claims: f.database.wechatRebindClaim });
    for (const path of ['/wechat-mobile/consume', '/wechat-rebind/confirm', '/wechat-mobile/cancel']) {
      const response = await f.request(path, { ...prepared.browser, body: { transactionId: prepared.transactionId, ...(path.endsWith('/consume') ? { confirmAccountSwitch: false } : {}) } });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(cookieHeader(response)).not.toContain('session_token=');
    }
    expect((await f.request(`/wechat-mobile/status?transactionId=${prepared.transactionId}`, { cookie: prepared.browser.cookie, tab: prepared.tabBinding })).status).toBeGreaterThanOrEqual(400);
    for (const path of ['/wechat-mobile/confirm', '/wechat-rebind/prove']) {
      const response = await f.request(path, { body: { transactionId: prepared.transactionId, completionCapability: prepared.manualCode, code: 'synthetic-code' } });
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
    expect({ accounts: f.database.account, sessions: f.database.session, claims: f.database.wechatRebindClaim }).toEqual(before);
  });

  it('requires live original session, exact Origin, cookie and tab for browser operations', async () => {
    const f = fixture();
    expect((await f.request('/wechat-prepublication/start', { body: {} })).status).toBe(401);
    const prepared = await f.startManual();
    const second = await f.signIn();
    const wrongOrigin = await f.auth.handler(new Request(`${origin}/api/auth/wechat-prepublication/start`, {
      body: '{}', headers: { 'content-type': 'application/json', cookie: prepared.sessionCookie, origin: 'https://other.example' }, method: 'POST',
    }));
    expect(wrongOrigin.status).toBe(403);
    for (const action of ['status', 'finish', 'cancel']) {
      const path = `/wechat-prepublication/${action}`;
      expect((await f.request(path, { body: prepared.browser.body, tab: prepared.tabBinding })).status).toBe(401);
      expect((await f.request(path, { ...prepared.browser, tab: 'wrong-tab' })).status).toBe(401);
      const differentSession = `${second.cookie}; ${prepared.browser.cookie.split('; ').filter((part: string) => part.startsWith('__Host-')).join('; ')}`;
      expect((await f.request(path, { ...prepared.browser, cookie: differentSession })).status).toBe(401);
    }
    f.database.session.splice(0);
    expect((await f.request('/wechat-prepublication/status', prepared.browser)).status).toBe(401);
  });

  it('fails closed without an existing WeChat association or when privacy/feature gates are closed', async () => {
    const f = fixture();
    const prepared = await f.startManual();
    vi.stubEnv('ENABLE_TELEMETRY', '1');
    expect((await f.proveManual(prepared.manualCode)).status).toBe(503);
    expect((await f.request('/wechat-prepublication', { cookie: prepared.sessionCookie })).status).toBe(503);
    vi.stubEnv('ENABLE_TELEMETRY', '');
    f.options.identityMode = 'maintenance';
    expect((await f.proveManual(prepared.manualCode)).status).toBe(423);
    f.options.identityMode = 'legacy';
    f.options.rebindEnabled = false;
    expect((await f.proveManual(prepared.manualCode)).status).toBeGreaterThanOrEqual(400);
    f.options.rebindEnabled = true;
    f.database.account.splice(0);
    expect((await f.request('/wechat-prepublication/start', { body: {}, cookie: prepared.sessionCookie })).status).toBe(409);
  });

  it('serves a private full document instead of the analytics-bearing root layout', async () => {
    const f = fixture();
    const { sessionCookie } = await f.startManual();
    const response = await f.request('/wechat-prepublication', { cookie: sessionCookie });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    const html = await response.text();
    expect(html).not.toMatch(/<script[^>]+src=|clarity|posthog|session_token|synthetic-/i);
    expect(cookieHeader(response)).not.toContain('session_token=');
  });

  it('cancellation wins over a delayed provider response and manual replay', async () => {
    const f = fixture();
    const prepared = await f.startManual();
    let resolveProvider: (response: Response) => void = () => {};
    const provider = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((resolve) => { resolveProvider = resolve; }));
    const pending = f.proveManual(prepared.manualCode);
    await vi.waitFor(() => expect(provider).toHaveBeenCalled());
    expect((await f.request('/wechat-prepublication/cancel', prepared.browser)).status).toBe(200);
    resolveProvider(Response.json(providerIdentity));
    expect((await pending).status).toBe(404);
    expect((await f.proveManual(prepared.manualCode)).status).toBe(404);
    expect(await (await f.request('/wechat-prepublication/status', prepared.browser)).json()).toEqual({ state: 'cancelled' });
    expect((await f.request('/wechat-prepublication/finish', prepared.browser)).status).toBe(409);
  });

  it('rejects expired or unknown credentials alike and never extends the deadline', async () => {
    const f = fixture();
    const prepared = await f.startManual();
    const row = f.database.wechatMobileLoginTransaction.find((item) => item.id === prepared.transactionId)!;
    row.expiresAt = new Date(Date.now() - 1000);
    const unknown = await f.proveManual('F'.repeat(20));
    const expired = await f.proveManual(prepared.manualCode);
    expect(expired.status).toBe(404);
    expect(await expired.json()).toEqual(await unknown.json());
    expect((await f.request('/wechat-prepublication/status', prepared.browser)).status).toBe(410);
  });

  it.each([429, 503, 'timeout', 'malformed'])('bounds retryable provider failure: %s', async (failure) => {
    const f = fixture();
    const prepared = await f.startManual();
    const provider = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      if (failure === 'timeout') throw new DOMException('synthetic provider timeout', 'AbortError');
      return failure === 'malformed' ? new Response('not-json') : new Response('private-provider-body', { status: typeof failure === 'number' ? failure : 503 });
    });
    const row = f.database.wechatMobileLoginTransaction.find((item) => item.id === prepared.transactionId)!;
    const deadline = row.expiresAt;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await f.proveManual(prepared.manualCode);
      expect([502, 503]).toContain(response.status);
      expect(await response.text()).not.toContain('private-provider-body');
    }
    expect((await f.proveManual(prepared.manualCode)).status).toBe(404);
    expect(provider).toHaveBeenCalledTimes(3);
    expect(row.expiresAt).toEqual(deadline);
    expect(f.database.session).toHaveLength(1);
    expect(f.database.wechatRebindClaim).toHaveLength(0);
  });

  it('does not turn missing UnionID into successful proof', async () => {
    const f = fixture();
    const prepared = await f.startManual();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ openid: 'synthetic', session_key: 'synthetic' }));
    const response = await f.proveManual(prepared.manualCode);
    expect(response.status).toBe(409);
    expect(await (await f.request('/wechat-prepublication/status', prepared.browser)).json()).toEqual({ state: 'failed' });
    expect((await f.request('/wechat-prepublication/finish', prepared.browser)).status).toBe(409);
    expect(f.database.wechatRebindClaim).toHaveLength(0);
  });

  it.each([{ unionid: 123 }, { unionid: ' ' }, { session_key: ['synthetic'] }, { openid: {} }])('rejects malformed provider identity fields: %j', async (invalid) => {
    const f = fixture();
    const prepared = await f.startManual();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ ...providerIdentity, ...invalid }));
    expect((await f.proveManual(prepared.manualCode)).status).toBe(502);
    expect((await f.request('/wechat-prepublication/finish', prepared.browser)).status).toBe(409);
    expect(f.database.session).toHaveLength(1);
    expect(f.database.wechatRebindClaim).toHaveLength(0);
  });

  it('preserves bridge IDs and requires both cookie and tab proofs', async () => {
    const { request, start } = fixture();
    const first = await start();
    const second = await start();
    const path = `/wechat-mobile/status?transactionId=${first.transactionId}`;
    const wrongTab = await request(path, { cookie: first.cookie, tab: second.tabBinding });
    expect(wrongTab.status).toBe(401);
    const missingCookie = await request(path, { tab: first.tabBinding });
    expect(missingCookie.status).toBe(401);
    const valid = await request(path, { cookie: first.cookie, tab: first.tabBinding });
    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({ state: 'pending' });
  });

  it('issues a normal session and recovers a lost consume response without a second session', async () => {
    const { database, request, signIn } = fixture();
    const { cookie, prepared } = await signIn();
    expect(cookie).toContain('__Secure-better-auth.session_token=');
    const sessionResponse = await request('/get-session', { cookie });
    const session = await sessionResponse.json();
    expect(session.user.id).toBe(database.account[0].userId);
    expect(database.account[0].accountId).toBe(providerIdentity.unionid);
    expect(database.session).toHaveLength(1);
    const recovered = await request('/wechat-mobile/consume', {
      body: { confirmAccountSwitch: false, transactionId: prepared.transactionId },
      cookie: prepared.cookie,
      tab: prepared.tabBinding,
    });
    expect(recovered.status).toBe(200);
    expect(cookieHeader(recovered)).toBe(cookie);
    expect(database.session).toHaveLength(1);
  });

  it('records a verified rebind claim without mutating the existing WeChat account', async () => {
    const { database, prove, request, signIn, start } = fixture();
    const signedIn = await signIn();
    const before = structuredClone(database.account);
    const prepared = await start('/wechat-rebind/start', signedIn.cookie);
    const proved = await prove(prepared);
    expect(proved.status).toBe(200);
    expect(database.wechatRebindClaim[0].id).toMatch(/^wxr_/);
    const confirmed = await request('/wechat-rebind/confirm', {
      body: { transactionId: prepared.transactionId },
      cookie: `${signedIn.cookie}; ${prepared.cookie}`,
      tab: prepared.tabBinding,
    });
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toEqual({ state: 'verified' });
    expect(database.account).toEqual(before);
    expect(database.wechatRebindClaim[0].state).toBe('verified');
  });

  it('never consumes a rebind proof as a sign-in session', async () => {
    const { database, prove, request, signIn, start } = fixture();
    const signedIn = await signIn();
    const prepared = await start('/wechat-rebind/start', signedIn.cookie);
    expect((await prove(prepared)).status).toBe(200);
    const before = structuredClone({ accounts: database.account, sessions: database.session });
    const consumed = await request('/wechat-mobile/consume', {
      body: { confirmAccountSwitch: false, transactionId: prepared.transactionId },
      cookie: `${signedIn.cookie}; ${prepared.cookie}`,
      tab: prepared.tabBinding,
    });
    expect(consumed.status).toBe(409);
    expect(cookieHeader(consumed)).not.toContain('session_token=');
    expect({ accounts: database.account, sessions: database.session }).toEqual(before);
  });
});
