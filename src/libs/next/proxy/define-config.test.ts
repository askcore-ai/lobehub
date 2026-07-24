// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('keeps browser page redirects to Better Auth sign-in', async () => {
    getSession.mockResolvedValue(null);
    const { middleware } = defineConfig();

    const response = await middleware(new NextRequest('https://askcore.cn/settings'));

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(response.headers.get('location')).toContain('/signin?callbackUrl=');
  });
});
