/**
 * @vitest-environment node
 */
import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createNodeRequest: vi.fn(),
  createNodeResponse: vi.fn(),
  middleware: vi.fn(),
  providerCallback: vi.fn(),
}));

vi.mock('debug', () => ({
  default: () => vi.fn(),
}));

vi.mock('@/envs/auth', () => ({
  authEnv: {
    ENABLE_OIDC: true,
  },
}));

vi.mock('@/libs/oidc-provider/http-adapter', () => ({
  createNodeRequest: mocks.createNodeRequest,
  createNodeResponse: mocks.createNodeResponse,
}));

vi.mock('@/server/services/oidc/oidcProvider', () => ({
  getOIDCProvider: vi.fn(async () => ({
    callback: mocks.providerCallback,
  })),
}));

describe('OIDC route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.providerCallback.mockReturnValue(mocks.middleware);
    mocks.createNodeResponse.mockReturnValue({
      nodeResponse: {},
      responseBody: '',
      responseHeaders: {},
      responseStatus: 200,
    });
  });

  it('returns a 500 response when creating the Node request fails', async () => {
    mocks.createNodeRequest.mockRejectedValueOnce(new Error('body stream aborted'));

    const { POST } = await import('./route');
    const request = new Request('https://example.com/oidc/token', {
      body: 'grant_type=refresh_token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    }) as unknown as NextRequest;

    const response = await Promise.race([
      POST(request),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('OIDC route timed out')), 50),
      ),
    ]);

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toContain('body stream aborted');
    expect(mocks.middleware).not.toHaveBeenCalled();
  });

  it('forces school authorization to reselect the current Better Auth account', async () => {
    mocks.createNodeRequest.mockImplementation(async (request: NextRequest) => {
      expect(new URL(request.url).searchParams.get('prompt')).toBe('login');
      return {};
    });
    mocks.middleware.mockImplementation((_request, _response, done) => done());

    const { GET } = await import('./route');
    const request = new Request(
      'https://askcore.cn/oidc/auth?client_id=askcore-moodle&response_type=code',
      { method: 'GET' },
    ) as unknown as NextRequest;

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mocks.createNodeRequest).toHaveBeenCalledTimes(1);
  });

  it('does not force account selection for non-school OIDC clients', async () => {
    mocks.createNodeRequest.mockImplementation(async (request: NextRequest) => {
      expect(new URL(request.url).searchParams.has('prompt')).toBe(false);
      return {};
    });
    mocks.middleware.mockImplementation((_request, _response, done) => done());

    const { GET } = await import('./route');
    const request = new Request(
      'https://askcore.cn/oidc/auth?client_id=lobehub-desktop&response_type=code',
      { method: 'GET' },
    ) as unknown as NextRequest;

    expect((await GET(request)).status).toBe(200);
  });
});
