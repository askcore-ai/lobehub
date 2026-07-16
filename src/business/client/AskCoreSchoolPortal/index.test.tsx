import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig, unstable_serialize } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchSchoolPortalManifestForGeneration,
  fetchSchoolSourceSessionForGeneration,
  invalidateSchoolPortalBootstrap,
  primeSchoolPortalBootstrap,
  SCHOOL_PORTAL_API,
} from './api';
import { AskCoreSchoolPortalRoute } from './index';

const authState = vi.hoisted(() => ({
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
  authState.sessionId = 'session-1';
  authState.userId = 'user-1';
  vi.useRealTimers();
  vi.unstubAllGlobals();
  invalidateSchoolPortalBootstrap();
});

describe('school portal bootstrap', () => {
  it('starts account, portal, and source-role probes together and binds them to one session', async () => {
    const portal = readyPortal();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/get-session')) {
        return Response.json({ session: { id: 'session-1' }, user: { id: 'user-1' } });
      }
      if (url.includes('/askcore/session.php')) {
        return Response.json({ authenticated: true, role: 'student' });
      }
      return Response.json(portal);
    });
    vi.stubGlobal('fetch', fetchMock);

    const bootstrap = primeSchoolPortalBootstrap();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await bootstrap;

    await expect(fetchSchoolPortalManifestForGeneration('user-1:session-1')).resolves.toEqual(
      portal,
    );
    await expect(
      fetchSchoolSourceSessionForGeneration(
        '/school/services/askcore/session.php',
        'user-1:session-1',
      ),
    ).resolves.toEqual({ authenticated: true, role: 'student' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('discards prefetched source data when the Better Auth generation differs', async () => {
    let portalRequests = 0;
    let sourceRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/get-session')) {
        return Response.json({ session: { id: 'session-a' }, user: { id: 'user-a' } });
      }
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

    await primeSchoolPortalBootstrap();
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
    await waitFor(() => expect(sourceRequestCount()).toBeGreaterThan(sourceRequestsBeforeLoad));
    const sourceRequestsAfterReady = sourceRequestCount();

    await act(async () => {
      fireEvent.load(frame);
      await Promise.resolve();
    });
    expect(sourceRequestCount()).toBe(sourceRequestsAfterReady);
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
