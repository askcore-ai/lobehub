import path from 'node:path';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig, unstable_serialize } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchSchoolPortalManifestForGeneration,
  fetchSchoolSourceSessionForGeneration,
  invalidateSchoolPortalBootstrap,
  readSchoolPortalBootstrapSnapshot,
  recoverSchoolSourceSession,
  SCHOOL_PORTAL_API,
} from './api';
import { AskCoreSchoolPortalRoute } from './index';

const authState = vi.hoisted(() => ({
  isPending: false,
  isRefetching: false,
  sessionId: 'session-1' as string | undefined,
  userId: 'user-1' as string | undefined,
}));

const commonTranslations = vi.hoisted<Record<string, string>>(() => ({
  'retry': '重试',
  'schoolPortal.connection.refresh': '刷新连接状态',
  'schoolPortal.connection.unavailable': '学校服务暂不可用',
  'schoolPortal.identity.denied': '当前学校身份无权访问此页面',
  'schoolPortal.name': 'AskCore 在线学校',
  'schoolPortal.state.conflict.message': '请联系学校管理员确认正确的学校连接后重试。',
  'schoolPortal.state.conflict.title': '学校连接存在冲突',
  'schoolPortal.state.unavailable.message': '学校服务正在恢复，请稍后重试。个人空间仍可正常使用。',
  'schoolPortal.state.unavailable.title': '学校连接暂不可用',
  'schoolPortal.surface.learningSpace': '学习空间',
  'schoolPortal.surface.school': '学校',
  'schoolPortal.surface.teachingCenter': '教学中心',
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => commonTranslations[key] || key }),
}));

vi.mock('@/libs/better-auth/auth-client', () => ({
  useSession: () => ({
    data: { session: { id: authState.sessionId }, user: { id: authState.userId } },
    isPending: authState.isPending,
    isRefetching: authState.isRefetching,
  }),
}));

const readyPortal = (canManageIntegrations = false) => ({
  can_manage_integrations: canManageIntegrations,
  contract: 'askcore.school-portal.v2',
  schools: [
    {
      destinations: [
        {
          description: '课程、作业、提交与成绩',
          key: 'teaching',
          label: '教学中心',
          launch_url: 'about:blank#teaching-launch',
          session_launch_url: 'about:blank#teaching-session',
        },
        {
          description: '校务资料与学校服务',
          key: 'school-services',
          label: '校务中心',
          launch_url: 'about:blank#services-launch',
          session_launch_url: 'about:blank#services-session',
        },
      ],
      key: 'askcore-online-school',
      name: 'AskCore 在线学校',
      role_source_url: '/school/services/askcore/session.php',
    },
  ],
  selection_required: false,
  show_school_entry: true,
  state: 'ready',
});

const cacheablePortal = () => {
  const portal = readyPortal();
  portal.schools[0].role_source_url = `${window.location.origin}/school/services/askcore/session.php`;
  for (const destination of portal.schools[0].destinations) {
    destination.launch_url = `/api/askcore/school/launch/${destination.key}-${'a'.repeat(40)}`;
    destination.session_launch_url = `/api/askcore/school/launch/${destination.key}-${'b'.repeat(40)}`;
  }
  return portal;
};

const markFrameReady = async (frame: HTMLElement) => {
  const iframe = frame as HTMLIFrameElement;
  const marker = iframe.contentDocument?.createElement('meta');
  if (!marker || !iframe.contentDocument) throw new Error('iframe document is unavailable');
  marker.name = 'askcore-session';
  marker.content = 'ready';
  iframe.contentDocument.head.append(marker);
  await act(async () => {
    fireEvent.load(iframe);
    await Promise.resolve();
  });
};

beforeEach(() => invalidateSchoolPortalBootstrap());

afterEach(() => {
  authState.isPending = false;
  authState.isRefetching = false;
  authState.sessionId = 'session-1';
  authState.userId = 'user-1';
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  invalidateSchoolPortalBootstrap();
});

describe('school portal bootstrap', () => {
  it('starts one portal and source-role probe for the authenticated session generation', async () => {
    const portal = cacheablePortal();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/askcore/session.php')) {
        return Response.json({ authenticated: true, role: 'student' });
      }
      return Response.json(portal);
    });
    vi.stubGlobal('fetch', fetchMock);

    const bootstrap = fetchSchoolPortalManifestForGeneration('user-1:session-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(bootstrap).resolves.toEqual(portal);
    await expect(
      fetchSchoolSourceSessionForGeneration(
        '/school/services/askcore/session.php',
        'user-1:session-1',
      ),
    ).resolves.toEqual({ authenticated: true, role: 'student' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('persists a short-lived bootstrap snapshot only for the exact account session', async () => {
    const portal = cacheablePortal();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/askcore/session.php')
          ? Response.json({ authenticated: true, role: 'student' })
          : Response.json(portal),
      ),
    );

    await Promise.all([
      fetchSchoolPortalManifestForGeneration('user-1:session-1'),
      fetchSchoolSourceSessionForGeneration(
        '/school/services/askcore/session.php',
        'user-1:session-1',
      ),
    ]);

    const firstRead = readSchoolPortalBootstrapSnapshot('user-1:session-1');
    expect(firstRead).toMatchObject({
      portal: { state: 'ready' },
      sourceSession: { authenticated: true, role: 'student' },
    });
    expect(readSchoolPortalBootstrapSnapshot('user-1:session-1')).toBe(firstRead);
    expect(window.localStorage.getItem('askcore.school-bootstrap.v1')).not.toContain('user-1');
    expect(window.localStorage.getItem('askcore.school-bootstrap.v1')).not.toContain('session-1');
    expect(readSchoolPortalBootstrapSnapshot('user-2:session-2')).toBeUndefined();
    expect(window.localStorage.getItem('askcore.school-bootstrap.v1')).toBeNull();
  });

  it('accepts the canonical same-origin role endpoint in relative form', async () => {
    const portal = cacheablePortal();
    portal.schools[0].role_source_url = '/school/services/askcore/session.php';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/askcore/session.php')
          ? Response.json({ authenticated: true, role: 'student' })
          : Response.json(portal),
      ),
    );

    await Promise.all([
      fetchSchoolPortalManifestForGeneration('user-1:session-1'),
      fetchSchoolSourceSessionForGeneration(
        '/school/services/askcore/session.php',
        'user-1:session-1',
      ),
    ]);

    expect(readSchoolPortalBootstrapSnapshot('user-1:session-1')).toMatchObject({
      portal: { schools: [{ role_source_url: '/school/services/askcore/session.php' }] },
      sourceSession: { role: 'student' },
    });
  });

  it('does not let disabled browser storage break bootstrap invalidation', () => {
    vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => {
      throw new DOMException('Storage disabled', 'SecurityError');
    });

    expect(() => invalidateSchoolPortalBootstrap()).not.toThrow();
  });

  it('expires the bootstrap snapshot before a portal launch token can expire', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/askcore/session.php')
          ? Response.json({ authenticated: true, role: 'student' })
          : Response.json(cacheablePortal()),
      ),
    );
    const cachedAt = 1_000_000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(cachedAt);
    await Promise.all([
      fetchSchoolPortalManifestForGeneration('user-1:session-1'),
      fetchSchoolSourceSessionForGeneration(
        '/school/services/askcore/session.php',
        'user-1:session-1',
      ),
    ]);

    now.mockReturnValue(cachedAt + 30_001);

    expect(readSchoolPortalBootstrapSnapshot('user-1:session-1')).toBeUndefined();
  });

  it('never persists an incomplete portal-only bootstrap', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        String(input).includes('/askcore/session.php')
          ? new Promise<Response>(() => {})
          : Promise.resolve(Response.json(cacheablePortal())),
      ),
    );

    await fetchSchoolPortalManifestForGeneration('user-1:session-1');

    expect(readSchoolPortalBootstrapSnapshot('user-1:session-1')).toBeUndefined();
    expect(window.localStorage.getItem('askcore.school-bootstrap.v1')).toBeNull();
  });

  it('rejects an entire bootstrap generation when either source contains unknown fields', async () => {
    const portal = Object.assign(cacheablePortal(), { external_id: 'must-not-persist' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/askcore/session.php')
          ? Response.json({ authenticated: true, external_id: 'must-not-persist', role: 'student' })
          : Response.json(portal),
      ),
    );

    await Promise.all([
      fetchSchoolPortalManifestForGeneration('user-1:session-1'),
      fetchSchoolSourceSessionForGeneration(
        '/school/services/askcore/session.php',
        'user-1:session-1',
      ),
    ]);

    expect(readSchoolPortalBootstrapSnapshot('user-1:session-1')).toBeUndefined();
    expect(window.localStorage.getItem('askcore.school-bootstrap.v1')).toBeNull();
  });

  it('ignores a superseded bootstrap promise after lifecycle invalidation', async () => {
    let resolveOldPortal!: (response: Response) => void;
    let resolveOldSource!: (response: Response) => void;
    let portalRequests = 0;
    let sourceRequests = 0;
    const oldPortal = new Promise<Response>((resolve) => {
      resolveOldPortal = resolve;
    });
    const oldSource = new Promise<Response>((resolve) => {
      resolveOldSource = resolve;
    });
    const freshPortal = cacheablePortal();
    freshPortal.schools[0].name = 'Fresh school';
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        if (String(input).includes('/askcore/session.php')) {
          sourceRequests += 1;
          return sourceRequests === 1
            ? oldSource
            : Promise.resolve(Response.json({ authenticated: true, role: 'teacher' }));
        }
        portalRequests += 1;
        return portalRequests === 1 ? oldPortal : Promise.resolve(Response.json(freshPortal));
      }),
    );

    const superseded = Promise.all([
      fetchSchoolPortalManifestForGeneration('user-1:session-1'),
      fetchSchoolSourceSessionForGeneration(
        '/school/services/askcore/session.php',
        'user-1:session-1',
      ),
    ]);
    invalidateSchoolPortalBootstrap();
    await Promise.all([
      fetchSchoolPortalManifestForGeneration('user-1:session-1'),
      fetchSchoolSourceSessionForGeneration(
        '/school/services/askcore/session.php',
        'user-1:session-1',
      ),
    ]);

    resolveOldPortal(Response.json(cacheablePortal()));
    resolveOldSource(Response.json({ authenticated: true, role: 'student' }));
    await superseded;

    expect(readSchoolPortalBootstrapSnapshot('user-1:session-1')).toMatchObject({
      portal: { schools: [{ name: 'Fresh school' }] },
      sourceSession: { role: 'teacher' },
    });
  });

  it('discards prefetched source data when the Better Auth generation differs', async () => {
    let portalRequests = 0;
    let sourceRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/askcore/session.php')) {
        sourceRequests += 1;
        return Response.json({
          authenticated: true,
          role: sourceRequests === 1 ? 'student' : 'teacher',
        });
      }
      portalRequests += 1;
      const response = readyPortal();
      response.schools[0].name = portalRequests === 1 ? 'Account A' : 'Account B';
      return Response.json(response);
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchSchoolPortalManifestForGeneration('user-a:session-a');
    await expect(fetchSchoolPortalManifestForGeneration('user-b:session-b')).resolves.toMatchObject(
      {
        schools: [{ name: 'Account B' }],
      },
    );
    await expect(
      fetchSchoolSourceSessionForGeneration(
        '/school/services/askcore/session.php',
        'user-b:session-b',
      ),
    ).resolves.toEqual({ authenticated: true, role: 'teacher' });
    expect(portalRequests).toBe(2);
    expect(sourceRequests).toBe(2);
  });

  it('shares unresolved bootstrap results across concurrent consumers', async () => {
    let resolvePortal!: (response: Response) => void;
    const portalResponse = new Promise<Response>((resolve) => {
      resolvePortal = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) =>
      String(input).includes('/askcore/session.php')
        ? Promise.resolve(Response.json({ authenticated: true, role: 'student' }))
        : portalResponse,
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = fetchSchoolPortalManifestForGeneration('user-1:session-1');
    const second = fetchSchoolPortalManifestForGeneration('user-1:session-1');
    resolvePortal(Response.json(readyPortal()));

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).includes('/api/askcore/school/portal'),
      ),
    ).toHaveLength(1);
  });

  it('does not hold the portal response behind a pending source-role probe', async () => {
    let resolveSource!: (response: Response) => void;
    const sourceResponse = new Promise<Response>((resolve) => {
      resolveSource = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        String(input).includes('/askcore/session.php')
          ? sourceResponse
          : Promise.resolve(Response.json(readyPortal())),
      ),
    );

    await expect(fetchSchoolPortalManifestForGeneration('user-1:session-1')).resolves.toMatchObject(
      { state: 'ready' },
    );
    resolveSource(Response.json({ authenticated: true, role: 'student' }));
    await expect(
      fetchSchoolSourceSessionForGeneration(
        '/school/services/askcore/session.php',
        'user-1:session-1',
      ),
    ).resolves.toMatchObject({ authenticated: true, role: 'student' });
  });

  it('retries a source-role probe after Gibbon finishes establishing its session', async () => {
    const refresh = vi
      .fn<() => Promise<{ authenticated: true; role: 'student' }>>()
      .mockRejectedValueOnce(new Error('source session is still redirecting'))
      .mockResolvedValue({ authenticated: true, role: 'student' });

    await expect(recoverSchoolSourceSession(refresh, { retryDelayMs: 0 })).resolves.toMatchObject({
      authenticated: true,
      role: 'student',
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe('AskCoreSchoolPortalRoute', () => {
  it('adopts the first authenticated generation without repeating portal and role reads', async () => {
    authState.sessionId = undefined;
    authState.userId = undefined;
    let portalRequests = 0;
    let sourceRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/askcore/session.php')) {
          sourceRequests += 1;
          return Response.json({ authenticated: true, role: 'student' });
        }
        portalRequests += 1;
        return Response.json(readyPortal());
      }),
    );
    const view = render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter initialEntries={['/school']}>
          <AskCoreSchoolPortalRoute />
        </MemoryRouter>
      </SWRConfig>,
    );

    authState.sessionId = 'session-1';
    authState.userId = 'user-1';
    view.rerender(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter initialEntries={['/school']}>
          <AskCoreSchoolPortalRoute />
        </MemoryRouter>
      </SWRConfig>,
    );

    expect(await screen.findByTitle('AskCore 在线学校 学校')).toHaveAttribute(
      'src',
      'about:blank#services-launch',
    );
    expect(portalRequests).toBe(1);
    expect(sourceRequests).toBe(1);
  });

  it.each([
    {
      destinationIndex: 1,
      destinationKey: 'school-services',
      path: '/school',
      title: 'AskCore 在线学校 学校',
    },
    {
      destinationIndex: 0,
      destinationKey: 'teaching',
      path: '/school/learning-space',
      title: 'AskCore 在线学校 学习空间',
    },
  ])(
    'waits for a fresh $destinationKey manifest instead of launching a cached expired token',
    async ({ destinationIndex, destinationKey, path, title }) => {
      const stalePortal = readyPortal();
      stalePortal.schools[0].destinations[destinationIndex].launch_url =
        `about:blank#expired-${destinationKey}-launch`;
      const freshPortal = readyPortal();
      freshPortal.schools[0].destinations[destinationIndex].launch_url =
        `about:blank#fresh-${destinationKey}-launch`;
      let resolvePortal!: (response: Response) => void;
      const portalRequest = new Promise<Response>((resolve) => {
        resolvePortal = resolve;
      });
      vi.stubGlobal(
        'fetch',
        vi.fn((input: RequestInfo | URL) =>
          String(input).includes('/askcore/session.php')
            ? Promise.resolve(Response.json({ authenticated: true, role: 'student' }))
            : portalRequest,
        ),
      );

      render(
        <SWRConfig
          value={{
            fallback: {
              [unstable_serialize([SCHOOL_PORTAL_API, 'user-1:session-1', destinationKey])]:
                stalePortal,
            },
            provider: () => new Map(),
          }}
        >
          <MemoryRouter initialEntries={[path]}>
            <AskCoreSchoolPortalRoute />
          </MemoryRouter>
        </SWRConfig>,
      );

      expect(screen.queryByTitle(title)).not.toBeInTheDocument();

      await act(async () => resolvePortal(Response.json(freshPortal)));
      expect(await screen.findByTitle(title)).toHaveAttribute(
        'src',
        `about:blank#fresh-${destinationKey}-launch`,
      );
    },
  );

  it('launches a fresh exact-generation snapshot while its live validation is pending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/askcore/session.php')
          ? Response.json({ authenticated: true, role: 'student' })
          : Response.json(cacheablePortal()),
      ),
    );
    await Promise.all([
      fetchSchoolPortalManifestForGeneration('user-1:session-1'),
      fetchSchoolSourceSessionForGeneration(
        '/school/services/askcore/session.php',
        'user-1:session-1',
      ),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );

    vi.useFakeTimers();
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter initialEntries={['/school']}>
          <AskCoreSchoolPortalRoute />
        </MemoryRouter>
      </SWRConfig>,
    );

    expect(screen.getByTitle('AskCore 在线学校 学校')).toHaveAttribute(
      'src',
      `/api/askcore/school/launch/school-services-${'a'.repeat(40)}`,
    );
    await act(async () => vi.advanceTimersByTimeAsync(30_001));
    expect(screen.queryByTitle('AskCore 在线学校 学校')).toBeNull();
  });

  it('covers an exact snapshot when only one half has completed live validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/askcore/session.php')
          ? Response.json({ authenticated: true, role: 'student' })
          : Response.json(cacheablePortal()),
      ),
    );
    await Promise.all([
      fetchSchoolPortalManifestForGeneration('user-1:session-1'),
      fetchSchoolSourceSessionForGeneration(
        '/school/services/askcore/session.php',
        'user-1:session-1',
      ),
    ]);
    let resolvePortal!: (response: Response) => void;
    const portalRequest = new Promise<Response>((resolve) => {
      resolvePortal = resolve;
    });
    const liveFetch = vi.fn((input: RequestInfo | URL) =>
      String(input).includes('/askcore/session.php')
        ? Promise.resolve(Response.json({ authenticated: true, role: 'student' }))
        : portalRequest,
    );
    vi.stubGlobal('fetch', liveFetch);

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter initialEntries={['/school']}>
          <AskCoreSchoolPortalRoute />
        </MemoryRouter>
      </SWRConfig>,
    );

    await waitFor(() =>
      expect(
        liveFetch.mock.calls.some(([input]) => String(input).includes('/askcore/session.php')),
      ).toBe(true),
    );
    expect(screen.queryByTitle('AskCore 在线学校 学校')).toBeNull();

    await act(async () => resolvePortal(Response.json(cacheablePortal())));
    expect(await screen.findByTitle('AskCore 在线学校 学校')).toBeInTheDocument();
  });

  it('renders the Gibbon school surface directly without destination cards', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) =>
      String(input).includes('/askcore/session.php')
        ? Response.json({ authenticated: true, role: 'student' })
        : Response.json(readyPortal()),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter initialEntries={['/school']}>
          <AskCoreSchoolPortalRoute />
        </MemoryRouter>
      </SWRConfig>,
    );

    const frame = await screen.findByTitle('AskCore 在线学校 学校');
    expect(frame).toHaveAttribute('src', 'about:blank#services-launch');
    expect(screen.queryByLabelText('进入学习空间')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('进入校务中心')).not.toBeInTheDocument();
    expect(screen.queryByText(/deployment|actor_hash|account_user_id/i)).not.toBeInTheDocument();

    const sourceRequestCount = () =>
      fetchMock.mock.calls.filter(([input]) => String(input).includes('/askcore/session.php'))
        .length;
    const sourceRequestsBeforeLoad = sourceRequestCount();
    const sourceRequest = fetchMock.mock.calls.find(([input]) =>
      String(input).includes('/askcore/session.php'),
    );
    expect(sourceRequest?.[1]).toEqual(expect.objectContaining({ redirect: 'manual' }));

    await act(async () => {
      fireEvent.load(frame);
      await Promise.resolve();
    });
    expect(sourceRequestCount()).toBe(sourceRequestsBeforeLoad);

    await markFrameReady(frame);
    expect(frame.closest('section')).not.toHaveAttribute('hidden');
    expect(sourceRequestCount()).toBe(sourceRequestsBeforeLoad);

    await act(async () => {
      fireEvent.load(frame);
      await Promise.resolve();
    });
    expect(sourceRequestCount()).toBe(sourceRequestsBeforeLoad);
  });

  it('keeps Gibbon hidden until a failed bootstrap role probe is recovered', async () => {
    let sourceAttempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/askcore/session.php')) {
          sourceAttempts += 1;
          if (sourceAttempts < 3) return new Response(null, { status: 503 });
          return Response.json({ authenticated: true, role: 'teacher' });
        }
        return Response.json(readyPortal());
      }),
    );

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter initialEntries={['/school']}>
          <AskCoreSchoolPortalRoute />
        </MemoryRouter>
      </SWRConfig>,
    );

    const recoveryFrame = await screen.findByTitle('askcore-school-role-recovery');
    expect(sourceAttempts).toBe(1);
    expect(screen.queryByTitle('AskCore 在线学校 学校')).toBeNull();
    await markFrameReady(recoveryFrame);
    await waitFor(() => expect(sourceAttempts).toBe(3), { timeout: 2000 });
    expect(await screen.findByTitle('AskCore 在线学校 学校')).toBeInTheDocument();
  });

  it('renders the live-role Moodle surface directly for a student', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/askcore/session.php')
          ? Response.json({ authenticated: true, role: 'student' })
          : Response.json(readyPortal()),
      ),
    );

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter initialEntries={['/school/learning-space']}>
          <AskCoreSchoolPortalRoute />
        </MemoryRouter>
      </SWRConfig>,
    );

    expect(await screen.findByText('学习空间')).toBeInTheDocument();
    const frame = screen.getByTitle('AskCore 在线学校 学习空间');
    expect(frame).toHaveAttribute('src', 'about:blank#teaching-launch');
    await markFrameReady(frame);
    expect(frame.closest('section')).not.toHaveAttribute('hidden');
  });

  it('waits for the final Gibbon recovery surface before probing the source role', async () => {
    let sourceAttempts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/askcore/session.php')) {
        sourceAttempts += 1;
        if (sourceAttempts === 1) return new Response(null, { status: 503 });
        return Response.json({ authenticated: true, role: 'student' });
      }
      return Response.json(readyPortal());
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter initialEntries={['/school/learning-space']}>
          <AskCoreSchoolPortalRoute />
        </MemoryRouter>
      </SWRConfig>,
    );

    const recoveryFrame = (await screen.findByTitle(
      'askcore-school-role-recovery',
    )) as HTMLIFrameElement;
    expect(sourceAttempts).toBe(1);

    await act(async () => {
      fireEvent.load(recoveryFrame);
      await Promise.resolve();
    });
    expect(sourceAttempts).toBe(1);

    await markFrameReady(recoveryFrame);
    expect(await screen.findByTitle('AskCore 在线学校 学习空间')).toHaveAttribute(
      'src',
      'about:blank#teaching-launch',
    );
    expect(sourceAttempts).toBe(2);
  });

  it('covers and replaces the source iframe when the Better Auth account session changes', async () => {
    const firstPortal = readyPortal();
    const secondPortal = readyPortal();
    secondPortal.schools[0].destinations[1].launch_url = 'about:blank#account-b-services';
    let portalRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/askcore/session.php')) {
          return Response.json({ authenticated: true, role: 'student' });
        }
        portalRequests += 1;
        return Response.json(portalRequests === 1 ? firstPortal : secondPortal);
      }),
    );

    const view = render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter initialEntries={['/school']}>
          <AskCoreSchoolPortalRoute />
        </MemoryRouter>
      </SWRConfig>,
    );
    const accountAFrame = await screen.findByTitle('AskCore 在线学校 学校');

    authState.sessionId = 'session-2';
    authState.userId = 'user-2';
    view.rerender(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter initialEntries={['/school']}>
          <AskCoreSchoolPortalRoute />
        </MemoryRouter>
      </SWRConfig>,
    );

    await waitFor(() =>
      expect(screen.getByTitle('AskCore 在线学校 学校')).toHaveAttribute(
        'src',
        'about:blank#account-b-services',
      ),
    );
    expect(screen.getByTitle('AskCore 在线学校 学校')).not.toBe(accountAFrame);
  });

  it('retains the mounted source iframe while Better Auth refetches the same session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/askcore/session.php')
          ? Response.json({ authenticated: true, role: 'student' })
          : Response.json(readyPortal()),
      ),
    );

    const view = render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter initialEntries={['/school']}>
          <AskCoreSchoolPortalRoute />
        </MemoryRouter>
      </SWRConfig>,
    );
    const originalFrame = await screen.findByTitle('AskCore 在线学校 学校');
    await markFrameReady(originalFrame);

    authState.isRefetching = true;
    view.rerender(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter initialEntries={['/school']}>
          <AskCoreSchoolPortalRoute />
        </MemoryRouter>
      </SWRConfig>,
    );

    expect(screen.getByTitle('AskCore 在线学校 学校')).toBe(originalFrame);
    expect(originalFrame.closest('section')).not.toHaveAttribute('hidden');
  });

  it('covers and remounts the source iframe after a BFCache restore', async () => {
    const firstPortal = readyPortal();
    const restoredPortal = readyPortal();
    restoredPortal.schools[0].destinations[1].launch_url = 'about:blank#restored-services';
    let portalRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/askcore/session.php')) {
          return Response.json({ authenticated: true, role: 'student' });
        }
        portalRequests += 1;
        return Response.json(portalRequests === 1 ? firstPortal : restoredPortal);
      }),
    );

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter initialEntries={['/school']}>
          <AskCoreSchoolPortalRoute />
        </MemoryRouter>
      </SWRConfig>,
    );
    const originalFrame = await screen.findByTitle('AskCore 在线学校 学校');
    await markFrameReady(originalFrame);

    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(originalFrame.closest('section')).toHaveAttribute('hidden');

    const pageshow = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(pageshow, 'persisted', { value: true });
    act(() => window.dispatchEvent(pageshow));

    await waitFor(() =>
      expect(screen.getByTitle('AskCore 在线学校 学校')).toHaveAttribute(
        'src',
        'about:blank#restored-services',
      ),
    );
    const restoredFrame = screen.getByTitle('AskCore 在线学校 学校');
    expect(restoredFrame).not.toBe(originalFrame);
    await markFrameReady(restoredFrame);
    expect(restoredFrame.closest('section')).not.toHaveAttribute('hidden');
  });

  it('keeps the mounted source page across bootstrap expiry and background refresh', async () => {
    vi.useFakeTimers();
    const firstPortal = cacheablePortal();
    const refreshedPortal = cacheablePortal();
    refreshedPortal.schools[0].destinations[1].launch_url =
      `/api/askcore/school/launch/school-services-${'c'.repeat(40)}`;
    let portalRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/askcore/session.php')) {
          return Response.json({ authenticated: true, role: 'student' });
        }
        portalRequests += 1;
        return Response.json(portalRequests <= 2 ? firstPortal : refreshedPortal);
      }),
    );

    await Promise.all([
      fetchSchoolPortalManifestForGeneration('user-1:session-1'),
      fetchSchoolSourceSessionForGeneration(
        '/school/services/askcore/session.php',
        'user-1:session-1',
      ),
    ]);
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter initialEntries={['/school']}>
          <AskCoreSchoolPortalRoute />
        </MemoryRouter>
      </SWRConfig>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      await Promise.resolve();
    });
    const originalFrame = screen.getByTitle('AskCore 在线学校 学校') as HTMLIFrameElement;
    await markFrameReady(originalFrame);
    originalFrame.contentDocument!.body.dataset.currentPage = 'student-profile';
    const originalSrc = originalFrame.getAttribute('src');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(35_000);
      await Promise.resolve();
    });

    const retainedFrame = screen.getByTitle('AskCore 在线学校 学校') as HTMLIFrameElement;
    expect(retainedFrame).toBe(originalFrame);
    expect(retainedFrame).toHaveAttribute('src', originalSrc);
    expect(retainedFrame.contentDocument?.body.dataset.currentPage).toBe('student-profile');
  });

  it('covers the source iframe when a completed role refresh becomes unauthenticated', async () => {
    vi.useFakeTimers();
    const portal = cacheablePortal();
    let sourceRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/askcore/session.php')) {
          sourceRequests += 1;
          return Response.json(
            sourceRequests === 1
              ? { authenticated: true, role: 'student' }
              : { authenticated: false },
          );
        }
        return Response.json(portal);
      }),
    );

    await Promise.all([
      fetchSchoolPortalManifestForGeneration('user-1:session-1'),
      fetchSchoolSourceSessionForGeneration(
        '/school/services/askcore/session.php',
        'user-1:session-1',
      ),
    ]);
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter initialEntries={['/school']}>
          <AskCoreSchoolPortalRoute />
        </MemoryRouter>
      </SWRConfig>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
    });
    const originalFrame = screen.getByTitle('AskCore 在线学校 学校');
    await markFrameReady(originalFrame);
    expect(sourceRequests).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_001);
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sourceRequests).toBeGreaterThanOrEqual(2);
    await vi.waitFor(() => expect(screen.queryByTitle('AskCore 在线学校 学校')).toBeNull());
  });

  it('keeps a source error document hidden and renders the bounded failure state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/askcore/session.php')
          ? Response.json({ authenticated: true, role: 'student' })
          : Response.json(readyPortal()),
      ),
    );

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter initialEntries={['/school']}>
          <AskCoreSchoolPortalRoute />
        </MemoryRouter>
      </SWRConfig>,
    );

    const frame = (await screen.findByTitle('AskCore 在线学校 学校')) as HTMLIFrameElement;
    if (!frame.contentDocument?.body) throw new Error('iframe document is unavailable');
    frame.contentDocument.body.innerText = '{"detail":"School destination is unavailable"}';
    fireEvent.load(frame);

    expect(frame.closest('section')).toHaveAttribute('hidden');
    expect(await screen.findByText('学校服务暂不可用')).toBeInTheDocument();
    expect(screen.getByText('刷新连接状态')).toBeInTheDocument();
  });

  it('fails closed when the visible source frame never reaches a ready destination', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/askcore/session.php')
          ? Response.json({ authenticated: true, role: 'student' })
          : Response.json(readyPortal()),
      ),
    );

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter initialEntries={['/school']}>
          <AskCoreSchoolPortalRoute />
        </MemoryRouter>
      </SWRConfig>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const frame = screen.getByTitle('AskCore 在线学校 学校');
    act(() => vi.advanceTimersByTime(30_000));

    expect(frame.closest('section')).toHaveAttribute('hidden');
    expect(screen.getByText('学校服务暂不可用')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('renders an actionable source-unavailable state without a legacy binding fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          can_manage_integrations: false,
          contract: 'askcore.school-portal.v2',
          schools: [],
          selection_required: false,
          show_school_entry: true,
          state: 'unavailable',
        }),
      ),
    );

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter>
          <AskCoreSchoolPortalRoute />
        </MemoryRouter>
      </SWRConfig>,
    );

    expect(await screen.findByText('学校连接暂不可用')).toBeInTheDocument();
    expect(screen.getByText(/个人空间仍可正常使用/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/绑定邀请|当前组织/)).not.toBeInTheDocument());
  });

  it('keeps the Gibbon surface full-height and omits the system integration panel', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/askcore/session.php')) {
        return Response.json({ authenticated: true, role: 'administrator' });
      }
      return Response.json(readyPortal(true));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <MemoryRouter>
          <AskCoreSchoolPortalRoute />
        </MemoryRouter>
      </SWRConfig>,
    );

    expect(await screen.findByTitle('AskCore 在线学校 学校')).toHaveAttribute(
      'src',
      'about:blank#services-launch',
    );
    expect(screen.queryByText('系统集成')).not.toBeInTheDocument();
    expect(screen.queryByText('教学处理连接')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/askcore/school/operations', expect.anything());
  });
});

describe('personalized SPA shell', () => {
  it('is explicitly dynamic so production never writes a prerender cache', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(
      path.join(process.cwd(), 'src/app/spa/[variants]/[[...path]]/route.ts'),
      'utf8',
    );

    expect(source).toContain("export const dynamic = 'force-dynamic';");
  });

  it('anchors bootstrap trust to a private no-store exact-session digest', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(
      path.join(process.cwd(), 'src/app/spa/[variants]/[[...path]]/route.ts'),
      'utf8',
    );

    expect(source).toContain('schoolSessionGenerationHash');
    expect(source).toContain("createHash('sha256')");
    expect(source).toContain("'Cache-Control': 'private, no-store'");
  });
});
