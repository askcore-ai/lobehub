// @vitest-environment node
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { wechatMobileLogin } from '.';

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
  const auth = betterAuth({
    advanced: { database: { generateId: () => `framework_${++nextId}` } },
    baseURL: origin,
    database: memoryAdapter(database),
    logger: { disabled: true },
    plugins: [
      wechatMobileLogin({
        appId: 'synthetic-website',
        appSecret: 'synthetic-mini-secret',
        appURL: origin,
        identityMode: 'canonical',
        miniProgramAppId: 'synthetic-mini',
        mobileLoginEnabled: true,
        rebindEnabled: true,
        recoverySeconds: 60,
        schemePath: 'pages/login/index',
        transactionTtlSeconds: 300,
        websiteAppSecret: 'synthetic-website-secret',
      }),
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

  return { auth, database, prove, request, signIn, start };
}

afterEach(() => vi.restoreAllMocks());

describe('WeChat bridge through the real Better Auth handler and adapter factory', () => {
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
});
