import { describe, expect, it, vi } from 'vitest';

import { wechatMobileLogin } from '.';
import { exchangeWechatMiniProgramCode, exchangeWechatWebsiteCode } from './wechat-client';

const options = {
  appId: 'wx-site',
  appSecret: 'server-only-secret',
  appURL: 'https://askcore.cn',
  identityMode: 'canonical' as const,
  miniProgramAppId: 'wx-mini',
  mobileLoginEnabled: true,
  rebindEnabled: true,
  recoverySeconds: 60,
  schemePath: 'pages/login/index' as const,
  transactionTtlSeconds: 300 as const,
  websiteAppSecret: 'website-server-only-secret',
};

describe('wechatMobileLogin Better Auth plugin', () => {
  it('owns every sign-in and rebind endpoint under Better Auth', () => {
    const plugin = wechatMobileLogin(options);
    expect(plugin.id).toBe('wechat-mobile-login');
    expect(Object.keys(plugin.endpoints || {}).sort()).toEqual(
      [
        'cancelWechatMobileLogin',
        'callbackWechatRebind',
        'confirmWechatMobileLogin',
        'confirmWechatRebind',
        'consumeWechatMobileLogin',
        'getWechatMobileLoginStatus',
        'proveWechatRebind',
        'startWechatMobileLogin',
        'startWechatRebind',
      ].sort(),
    );
    expect(plugin.schema).toHaveProperty('wechatMobileLoginTransaction');
    expect(plugin.schema).toHaveProperty('wechatRebindClaim');
    expect(
      plugin.rateLimit?.some(
        (rule) => rule.max === 20 && rule.pathMatcher('/wechat-mobile/consume'),
      ),
    ).toBe(true);
  });

  it('rejects an invalid recovery window during configuration', () => {
    expect(() => wechatMobileLogin({ ...options, recoverySeconds: 0 })).toThrow(
      'AUTH_WECHAT_SESSION_RECOVERY_SECONDS',
    );
    expect(() => wechatMobileLogin({ ...options, transactionTtlSeconds: 299 as 300 })).toThrow(
      'AUTH_WECHAT_TRANSACTION_TTL_SECONDS',
    );
  });

  it('requires UnionID and never returns provider identity material', async () => {
    const response = new Response(
      JSON.stringify({ openid: 'transport', session_key: 'sensitive-session-key' }),
      { status: 200 },
    );
    await expect(
      exchangeWechatMiniProgramCode({
        appId: 'wx-mini',
        appSecret: 'secret',
        code: 'one-time',
        fetcher: vi.fn().mockResolvedValue(response),
      }),
    ).rejects.toMatchObject({ kind: 'missing_unionid' });
  });

  it('blocks only WeChat starts and delayed callbacks during maintenance', async () => {
    const plugin = wechatMobileLogin({ ...options, identityMode: 'maintenance' });
    const wechatStart = await plugin.onRequest?.(
      new Request('https://askcore.cn/api/auth/sign-in/oauth2', {
        body: JSON.stringify({ providerId: 'wechat' }),
        method: 'POST',
      }),
      {} as never,
    );
    const delayedCallback = await plugin.onRequest?.(
      new Request('https://askcore.cn/api/auth/oauth2/callback/wechat?code=delayed'),
      {} as never,
    );
    const emailSession = await plugin.onRequest?.(
      new Request('https://askcore.cn/api/auth/get-session'),
      {} as never,
    );

    expect('response' in wechatStart! ? wechatStart.response.status : undefined).toBe(423);
    expect('response' in delayedCallback! ? delayedCallback.response.status : undefined).toBe(423);
    expect(emailSession).toBeUndefined();
  });

  it('classifies WeChat 5xx as retryable without exposing raw response', async () => {
    await expect(
      exchangeWechatMiniProgramCode({
        appId: 'wx-mini',
        appSecret: 'secret',
        code: 'one-time',
        fetcher: vi.fn().mockResolvedValue(new Response('provider body', { status: 503 })),
      }),
    ).rejects.toMatchObject({ kind: 'retryable' });
  });

  it('uses the website application exchange for desktop rebind proof', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'transport-token',
          openid: 'website-openid',
          refresh_token: 'refresh-token',
          unionid: 'canonical-unionid',
        }),
        { status: 200 },
      ),
    );

    await expect(
      exchangeWechatWebsiteCode({
        appId: 'wx-site',
        appSecret: 'website-secret',
        code: 'website-code',
        fetcher,
      }),
    ).resolves.toMatchObject({
      openid: 'website-openid',
      unionid: 'canonical-unionid',
    });
    const endpoint = new URL(fetcher.mock.calls[0][0]);
    expect(endpoint.hostname).toBe('api.weixin.qq.com');
    expect(endpoint.searchParams.get('grant_type')).toBe('authorization_code');
  });
});
