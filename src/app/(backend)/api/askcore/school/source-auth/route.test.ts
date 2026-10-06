// @vitest-environment node
import { createServer } from 'node:http';
import { type AddressInfo } from 'node:net';

import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const createSourceAccessProof = vi.hoisted(() => vi.fn());

class TestSchoolSessionRequiredError extends Error {}

vi.mock('@/server/services/schoolSessionBroker', () => ({
  createSourceAccessProof,
  SchoolSessionRequiredError: TestSchoolSessionRequiredError,
}));

describe('internal school composite source authorization', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    delete process.env.ASKCORE_GIBBON_SESSION_VERIFY_URL;
    delete process.env.ASKCORE_MOODLE_SESSION_VERIFY_URL;
  });

  const request = (
    source: 'gibbon' | 'moodle',
    sourceCookie: string,
    extra: Record<string, string> = {},
  ) =>
    new NextRequest('https://askcore.cn/api/askcore/school/source-auth', {
      headers: {
        cookie: 'better-auth.session_token=account-session',
        'x-askcore-internal-request': '1',
        'x-askcore-school-source': source,
        'x-askcore-source-cookie': sourceCookie,
        ...extra,
      },
    });

  it.each([
    [
      'moodle',
      'MoodleSession=source-session',
      'ASKCORE_MOODLE_SESSION_VERIFY_URL',
      'http://moodle.local/local/askcore/session.php?mode=edge',
    ],
    [
      'gibbon',
      'G0123456789abcdef=source-session',
      'ASKCORE_GIBBON_SESSION_VERIFY_URL',
      'http://gibbon.local/askcore/session.php?mode=edge',
    ],
  ] as const)(
    'verifies %s through one fixed server-side request without forwarding the account cookie',
    async (source, cookie, envName, target) => {
      process.env[envName] = target;
      createSourceAccessProof.mockResolvedValue({ expiresAt: 1784426405, proof: 'signed-proof' });
      const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
      vi.stubGlobal('fetch', fetchMock);
      const { GET } = await import('./route');

      const response = await GET(request(source, cookie));

      expect(response.status).toBe(204);
      expect(createSourceAccessProof).toHaveBeenCalledWith(expect.any(Headers), source);
      expect(fetchMock).toHaveBeenCalledOnce();
      const [calledTarget, init] = fetchMock.mock.calls[0];
      expect(calledTarget.toString()).toBe(target);
      expect(init?.headers).toEqual({
        Cookie: cookie,
        'X-AskCore-Source-Proof': 'signed-proof',
      });
      expect(JSON.stringify(init)).not.toContain('account-session');
    },
  );

  it.each([401, 403] as const)('preserves an explicit source denial %s', async (status) => {
    process.env.ASKCORE_MOODLE_SESSION_VERIFY_URL =
      'http://moodle.local/local/askcore/session.php?mode=edge';
    createSourceAccessProof.mockResolvedValue({ proof: 'signed-proof' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status })));
    const { GET } = await import('./route');

    expect((await GET(request('moodle', 'MoodleSession=source-session'))).status).toBe(status);
  });

  it('fails closed for malformed requests, missing configuration, and verifier failures', async () => {
    const { GET } = await import('./route');
    const hidden = await GET(
      new NextRequest('https://askcore.cn/api/askcore/school/source-auth'),
    );
    expect(hidden.status).toBe(404);

    const missingConfig = await GET(request('moodle', 'MoodleSession=source-session'));
    expect(missingConfig.status).toBe(503);

    process.env.ASKCORE_MOODLE_SESSION_VERIFY_URL =
      'http://moodle.local/local/askcore/session.php?mode=edge';
    createSourceAccessProof.mockResolvedValue({ proof: 'signed-proof' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })));
    expect((await GET(request('moodle', 'MoodleSession=source-session'))).status).toBe(503);
  });

  it('distinguishes a missing account session without contacting the source', async () => {
    process.env.ASKCORE_MOODLE_SESSION_VERIFY_URL =
      'http://moodle.local/local/askcore/session.php?mode=edge';
    createSourceAccessProof.mockRejectedValue(new TestSchoolSessionRequiredError());
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('./route');

    expect((await GET(request('moodle', 'MoodleSession=source-session'))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('authorizes a 38-image burst without flooding the same native-session verifier', async () => {
    let upstreamCalls = 0;
    let sessionWork = Promise.resolve();
    const server = createServer((_request, response) => {
      upstreamCalls += 1;
      // Model the native session's exclusive work using real HTTP connections.
      sessionWork = sessionWork.then(async () => {
        if (response.destroyed) return;
        await new Promise((resolve) => setTimeout(resolve, 110));
        if (!response.destroyed) response.writeHead(204).end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    process.env.ASKCORE_MOODLE_SESSION_VERIFY_URL =
      `http://127.0.0.1:${port}/session.php?mode=edge`;
    createSourceAccessProof.mockResolvedValue({ proof: 'same-current-account-proof' });
    const { GET } = await import('./route');

    try {
      const responses = await Promise.all(
        Array.from({ length: 38 }, () => GET(request('moodle', 'MoodleSession=source-session'))),
      );
      expect(responses.map((response) => response.status)).toEqual(Array(38).fill(204));
      expect(upstreamCalls).toBe(1);
      expect(createSourceAccessProof).toHaveBeenCalledTimes(38);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        }),
      );
      await sessionWork;
    }
  });

  it.each(['proof', 'cookie', 'target'] as const)(
    'keeps concurrent requests with a different %s independent',
    async (difference) => {
      const firstTarget = 'http://native.local/session.php?mode=edge';
      process.env.ASKCORE_MOODLE_SESSION_VERIFY_URL = firstTarget;
      createSourceAccessProof
        .mockResolvedValueOnce({ proof: 'account-one-proof' })
        .mockResolvedValueOnce({
          proof: difference === 'proof' ? 'account-two-proof' : 'account-one-proof',
        });
      const releases: Array<() => void> = [];
      const fetchMock = vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => {
        const status = releases.length === 0 ? 204 : 403;
        releases.push(() => resolve(new Response(null, { status })));
      }));
      vi.stubGlobal('fetch', fetchMock);
      const { GET } = await import('./route');
      const first = GET(request('moodle', 'MoodleSession=first-session'));
      if (difference === 'target') {
        process.env.ASKCORE_MOODLE_SESSION_VERIFY_URL = 'http://other-native.local/session.php?mode=edge';
      }
      const second = GET(request('moodle', difference === 'cookie'
        ? 'MoodleSession=second-session' : 'MoodleSession=first-session'));
      try {
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      } finally {
        releases.forEach((release) => release());
      }
      expect((await first).status).toBe(204);
      expect((await second).status).toBe(403);
      expect(createSourceAccessProof).toHaveBeenCalledTimes(2);
    },
  );

  it('checks the source again after a completed decision and observes revocation', async () => {
    process.env.ASKCORE_MOODLE_SESSION_VERIFY_URL = 'http://native.local/session.php?mode=edge';
    createSourceAccessProof.mockResolvedValue({ proof: 'same-current-account-proof' });
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('./route');
    expect((await GET(request('moodle', 'MoodleSession=source-session'))).status).toBe(204);
    expect((await GET(request('moodle', 'MoodleSession=source-session'))).status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(createSourceAccessProof).toHaveBeenCalledTimes(2);
  });

  it('clears a shared verifier failure and freshly checks recovery', async () => {
    process.env.ASKCORE_MOODLE_SESSION_VERIFY_URL = 'http://native.local/session.php?mode=edge';
    createSourceAccessProof.mockResolvedValue({ proof: 'same-current-account-proof' });
    let rejectVerification: (error: Error) => void = () => {};
    const fetchMock = vi.fn<typeof fetch>()
      .mockImplementationOnce(() => new Promise<Response>((_resolve, reject) => {
        rejectVerification = reject;
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('./route');
    const first = GET(request('moodle', 'MoodleSession=source-session'));
    const second = GET(request('moodle', 'MoodleSession=source-session'));
    try {
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    } finally {
      rejectVerification(new Error('native verifier timed out'));
    }
    expect((await first).status).toBe(503);
    expect((await second).status).toBe(503);
    expect((await GET(request('moodle', 'MoodleSession=source-session'))).status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(createSourceAccessProof).toHaveBeenCalledTimes(3);
  });

  it('checks each current account before it can join a pending source request', async () => {
    process.env.ASKCORE_MOODLE_SESSION_VERIFY_URL = 'http://native.local/session.php?mode=edge';
    createSourceAccessProof
      .mockResolvedValueOnce({ proof: 'current-account-proof' })
      .mockRejectedValueOnce(new TestSchoolSessionRequiredError());
    let release: () => void = () => {};
    const fetchMock = vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => {
      release = () => resolve(new Response(null, { status: 204 }));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('./route');
    const current = GET(request('moodle', 'MoodleSession=source-session'));
    try {
      const signedOut = await GET(request('moodle', 'MoodleSession=source-session'));
      expect(signedOut.status).toBe(401);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      release();
    }
    expect((await current).status).toBe(204);
    expect(createSourceAccessProof).toHaveBeenCalledTimes(2);
  });
});
