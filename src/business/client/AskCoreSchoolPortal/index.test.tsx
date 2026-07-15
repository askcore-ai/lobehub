import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig, unstable_serialize } from 'swr';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SCHOOL_PORTAL_API } from './api';
import { AskCoreSchoolPortalRoute } from './index';

const authState = vi.hoisted(() => ({ sessionId: 'session-1', userId: 'user-1' }));

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
          session_launch_url: '/api/askcore/school/launch/opaque-teaching-session',
        },
        {
          description: '校务资料与学校服务',
          key: 'school-services',
          label: '校务中心',
          launch_url: 'about:blank#services-launch',
          session_launch_url: '/api/askcore/school/launch/opaque-services-session',
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

afterEach(() => {
  authState.sessionId = 'session-1';
  authState.userId = 'user-1';
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('AskCoreSchoolPortalRoute', () => {
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
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

    await markFrameReady(frame);
    expect(frame.closest('section')).not.toHaveAttribute('hidden');
    await waitFor(() => expect(sourceRequestCount()).toBeGreaterThan(sourceRequestsBeforeLoad));
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
