// @vitest-environment node
import { createHash } from 'node:crypto';

import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { genericOAuth } from 'better-auth/plugins';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { wechatMobileLogin } from '../../plugins/wechat-mobile-login';
import Wechat from './wechat';

vi.mock('@/envs/auth', () => ({ authEnv: {} }));

const origin = 'https://askcore.example';
const unionid = 'synthetic-canonical-union';
const email = `wechat-${createHash('sha256').update(unionid).digest('hex')}@identity.askcore.invalid`;
const provider = () => Wechat.build({ AUTH_WECHAT_ID: 'synthetic-website', AUTH_WECHAT_SECRET: 'synthetic-secret' });
const tokens = (id: unknown = unionid) => ({
  accessToken: 'synthetic-access',
  raw: { openid: 'synthetic-website-openid', unionid: id },
});
const profile = (extra: Record<string, unknown> = {}) => ({
  headimgurl: 'https://example.com/avatar.png', nickname: '测试用户',
  openid: 'synthetic-website-openid', unionid, ...extra,
});

afterEach(() => { vi.restoreAllMocks(); });

describe('Release B website WeChat provider', () => {
  it('preserves desktop QR configuration and requires the canonical identity', async () => {
    const config = provider();
    expect(config.authorizationUrl).toBe('https://open.weixin.qq.com/connect/qrconnect');
    expect(config.authorizationUrlParams).toEqual({ appid: 'synthetic-website', response_type: 'code', scope: 'snsapi_login' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(profile()));
    expect(await config.getUserInfo!(tokens())).toEqual({
      email, emailVerified: false, id: unionid, image: 'https://example.com/avatar.png', name: '测试用户',
    });
  });

  it.each([undefined, '', ' ', 123, [], {}])('rejects missing or malformed UnionID %j', async (value) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(profile({ unionid: value })));
    expect(await provider().getUserInfo!(tokens(value))).toBeNull();
  });

  it.each([
    { unionid: 'different-union' },
    { openid: 'different-openid' },
    { errcode: 40003, errmsg: 'synthetic-private-provider-message' },
  ])('rejects inconsistent or failed userinfo %j', async (extra) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(profile(extra)));
    expect(await provider().getUserInfo!(tokens())).toBeNull();
  });

  it('does not let profile extras replace the canonical id or email policy', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(profile({
      email: 'unrelated@example.com', emailVerified: true, id: 'other-owner',
    })));
    expect(await provider().getUserInfo!(tokens())).toEqual({
      email, emailVerified: false, id: unionid, image: 'https://example.com/avatar.png', name: '测试用户',
    });
  });

  it('can obtain UnionID from matching userinfo when token response omits it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(profile()));
    const input = { accessToken: 'synthetic-access', raw: { openid: 'synthetic-website-openid' } };
    expect((await provider().getUserInfo!(input))?.id).toBe(unionid);
  });
});

const cookies = (response: Response) => response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');

function fixture() {
  const database: Record<string, Record<string, unknown>[]> = {
    account: [], session: [], user: [], verification: [],
    wechatMobileLoginTransaction: [], wechatRebindClaim: [],
  };
  const auth = betterAuth({
    account: { accountLinking: { allowDifferentEmails: true, enabled: true, trustedProviders: [] } },
    baseURL: origin,
    database: memoryAdapter(database),
    logger: { disabled: true },
    plugins: [
      genericOAuth({ config: [provider()] }),
      wechatMobileLogin({
        appId: 'synthetic-website', appSecret: 'synthetic-mini-secret', appURL: origin,
        identityMode: 'canonical', miniProgramAppId: 'synthetic-mini', mobileLoginEnabled: true,
        rebindEnabled: true, recoverySeconds: 60, schemePath: 'pages/login/index',
        transactionTtlSeconds: 300, websiteAppSecret: 'synthetic-secret',
      }),
    ],
    rateLimit: { enabled: false },
    secret: 'synthetic-framework-test-secret-at-least-32-characters',
    trustedOrigins: [origin],
  });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));
    expect(url.origin).toBe('https://api.weixin.qq.com');
    if (url.pathname === '/sns/oauth2/access_token') return Response.json({
      access_token: 'synthetic-access', openid: 'synthetic-website-openid', unionid,
    });
    if (url.pathname === '/sns/userinfo') return Response.json(profile());
    if (url.pathname === '/sns/jscode2session') return Response.json({
      openid: 'synthetic-mini-openid', session_key: 'synthetic-session-key', unionid,
    });
    throw new Error('unexpected provider path');
  });
  const request = (path: string, body?: unknown, cookie?: string, tab?: string) => {
    const headers = new Headers({ origin });
    if (body !== undefined) headers.set('content-type', 'application/json');
    if (cookie) headers.set('cookie', cookie);
    if (tab) headers.set('x-askcore-wechat-tab-binding', tab);
    return auth.handler(new Request(`${origin}/api/auth${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body), headers,
      method: body === undefined ? 'GET' : 'POST',
    }));
  };
  const desktop = async () => {
    const start = await request('/sign-in/oauth2', { callbackURL: '/chat', providerId: 'wechat' });
    expect(start.status).toBe(200);
    const target = new URL((await start.json()).url);
    return request(`/oauth2/callback/wechat?${new URLSearchParams({ code: 'synthetic-code', state: target.searchParams.get('state')! })}`, undefined, cookies(start));
  };
  const mobile = async () => {
    const started = await request('/wechat-mobile/start', { callbackURL: '/chat' });
    expect(started.status).toBe(200);
    const data = await started.json();
    const query = new URLSearchParams(new URL(data.openTarget).searchParams.get('query')!);
    const confirmed = await request('/wechat-mobile/confirm', {
      code: 'synthetic-code', completionCapability: query.get('c'), transactionId: data.transactionId,
    });
    expect(confirmed.status).toBe(200);
    const consumed = await request('/wechat-mobile/consume', {
      confirmAccountSwitch: false, transactionId: data.transactionId,
    }, cookies(started), data.tabBinding);
    expect(consumed.status).toBe(200);
    return consumed;
  };
  return { database, desktop, mobile, request };
}

describe('canonical identity through both real Better Auth handlers', () => {
  it.each(['desktop', 'mobile'] as const)('preserves one owner when %s logs in first', async (first) => {
    const f = fixture();
    const firstResponse = await f[first]();
    const firstSession = await (await f.request('/get-session', undefined, cookies(firstResponse))).json();
    expect(firstSession?.user?.id).toBeTruthy();
    const secondResponse = await f[first === 'desktop' ? 'mobile' : 'desktop']();
    const secondSession = await (await f.request('/get-session', undefined, cookies(secondResponse))).json();
    expect(secondSession?.user?.id).toBe(firstSession.user.id);
    expect(f.database.user).toHaveLength(1);
    expect(f.database.account).toHaveLength(1);
    expect(f.database.account[0]).toMatchObject({ accountId: unionid, providerId: 'wechat', userId: firstSession.user.id });
  });

  it('does not link a desktop identity to a different owner solely by synthetic email', async () => {
    const f = fixture();
    f.database.user.push({ createdAt: new Date(), email, emailVerified: true, id: 'unrelated-owner', name: 'Other', updatedAt: new Date() });
    const response = await f.desktop();
    expect(response.headers.get('location')).toContain('error=');
    expect(f.database.user).toHaveLength(1);
    expect(f.database.account).toEqual([]);
    expect(f.database.session).toEqual([]);
  });
});
