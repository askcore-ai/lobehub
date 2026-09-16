// @vitest-environment node
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { config as proxyConfig } from '@/proxy';

import { defineConfig, isApiLikeRoute } from './define-config';

const getSession = vi.hoisted(() => vi.fn());

vi.mock('@/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/envs/app', () => ({
  appEnv: {
    APP_URL: 'https://askcore.cn',
    MIDDLEWARE_REWRITE_THROUGH_LOCAL: false,
  },
}));
vi.mock('@/envs/auth', () => ({ authEnv: { ENABLE_OIDC: false } }));

describe('Better Auth proxy behavior', () => {
  beforeEach(() => getSession.mockReset());

  it('identifies API-like routes without treating pages as APIs', () => {
    expect(isApiLikeRoute('/api/askcore/school')).toBe(true);
    expect(isApiLikeRoute('/trpc/user.me')).toBe(true);
    expect(isApiLikeRoute('/webapi/chat')).toBe(true);
    expect(isApiLikeRoute('/settings')).toBe(false);
  });

  it('returns JSON 401 for an unauthenticated protected API', async () => {
    getSession.mockResolvedValue(null);
    const { middleware } = defineConfig();

    const response = await middleware(
      new NextRequest('https://askcore.cn/api/askcore/school/portal', {
        headers: { accept: 'application/json' },
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({ detail: 'Authentication required' });
  });

  it('lets only the exact actor-observation readiness probe reach its HMAC route', async () => {
    getSession.mockResolvedValue(null);
    const { middleware } = defineConfig();

    const response = await middleware(
      new NextRequest('https://askcore.cn/api/askcore/school/actor-observation?readiness=1', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(getSession).not.toHaveBeenCalled();

    const protectedResponse = await middleware(
      new NextRequest('https://askcore.cn/api/askcore/school/actor-observation?readiness=1&extra=1', {
        method: 'POST',
      }),
    );
    expect(protectedResponse.status).toBe(401);
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it('admits anonymous registration prepare before an account or session exists', async () => {
    getSession.mockResolvedValue(null);
    const url = 'https://askcore.cn/api/askcore/registration/prepare';
    expect(
      unstable_doesMiddlewareMatch({ config: proxyConfig, nextConfig: {}, url }),
    ).toBe(true);

    const response = await defineConfig().middleware(new NextRequest(url, { method: 'POST' }));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(getSession).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', 'prepare'],
    ['HEAD', 'prepare'],
    ['PUT', 'prepare'],
    ['OPTIONS', 'prepare'],
    ['POST', 'prepare?extra=1'],
    ['POST', 'prepare/'],
    ['POST', 'prepare/child'],
    ['POST', 'prepare-child'],
    ['GET', 'status'],
    ['POST', 'recover'],
  ])('keeps anonymous %s registration/%s protected', async (method, action) => {
    getSession.mockResolvedValue(null);
    const response = await defineConfig().middleware(
      new NextRequest(`https://askcore.cn/api/askcore/registration/${action}`, { method }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ detail: 'Authentication required' });
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it('lets only the exact composite source authorization GET reach its guarded route', async () => {
    getSession.mockResolvedValue(null);
    const { middleware } = defineConfig();

    const response = await middleware(
      new NextRequest('https://askcore.cn/api/askcore/school/source-auth', {
        headers: { 'x-askcore-internal-request': '1' },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(getSession).not.toHaveBeenCalled();

    const protectedResponse = await middleware(
      new NextRequest('https://askcore.cn/api/askcore/school/source-auth-child'),
    );
    expect(protectedResponse.status).toBe(401);
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it('keeps browser page redirects to Better Auth sign-in', async () => {
    getSession.mockResolvedValue(null);
    const { middleware } = defineConfig();

    const response = await middleware(new NextRequest('https://askcore.cn/settings'));

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(response.headers.get('location')).toContain('/signin?callbackUrl=');
  });

  it.each(['/wechat-rebind', '/wechat-rebind?hl=zh-CN'])(
    'dispatches the public rebind entry through the real Next matcher: %s',
    (pathname) => {
      expect(
        unstable_doesMiddlewareMatch({
          config: proxyConfig,
          nextConfig: {},
          url: `https://askcore.cn${pathname}`,
        }),
      ).toBe(true);
    },
  );

  it.each([
    { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', variant: 'zh-CN__0' },
    {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      variant: 'zh-CN__1',
    },
  ])('rewrites authenticated rebind to SSR for $variant', async ({ userAgent, variant }) => {
    getSession.mockResolvedValue({ user: { id: 'synthetic-rebind-user' } });
    const { middleware } = defineConfig();

    const response = await middleware(
      new NextRequest('https://askcore.cn/wechat-rebind?hl=zh-CN', {
        headers: { 'user-agent': userAgent },
      }),
    );

    expect(response.status).toBe(200);
    const rewrite = new URL(response.headers.get('x-middleware-rewrite')!);
    expect(rewrite.pathname).toBe(`/${variant}/wechat-rebind`);
    expect(rewrite.searchParams.get('hl')).toBe('zh-CN');
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it('keeps rebind session-protected and preserves its sign-in callback', async () => {
    getSession.mockResolvedValue(null);
    const { middleware } = defineConfig();

    const response = await middleware(
      new NextRequest('https://askcore.cn/wechat-rebind?hl=zh-CN'),
    );

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/signin');
    expect(location.searchParams.get('callbackUrl')).toBe(
      'https://askcore.cn/wechat-rebind?hl=zh-CN',
    );
    expect(location.searchParams.get('hl')).toBe('zh-CN');
    expect(getSession).toHaveBeenCalledTimes(1);
  });
});
