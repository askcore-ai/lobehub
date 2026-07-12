// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BusinessGlobalProvider from './BusinessGlobalProvider';

const state = vi.hoisted(() => ({ authenticated: true, userId: 'user-1' }));
const mutate = vi.hoisted(() => vi.fn());
const fetchSchoolSourceSession = vi.hoisted(() => vi.fn());

const portal = {
  can_manage_integrations: false,
  contract: 'askcore.school-portal.v2',
  schools: [
    {
      destinations: [
        {
          description: '课程、作业、提交与成绩',
          key: 'teaching',
          label: '教学中心',
          launch_url: '/api/askcore/school/launch/teaching',
          session_launch_url: 'about:blank#teaching-session',
        },
        {
          description: '校务资料与学校服务',
          key: 'school-services',
          label: '校务中心',
          launch_url: '/api/askcore/school/launch/services',
          session_launch_url: 'about:blank#services-session',
        },
      ],
      key: 'askcore-online-school',
      name: 'AskCore 在线学校',
      role_source_url: 'https://askcore.cn/school/services/askcore/session.php',
    },
  ],
  selection_required: false,
  show_school_entry: true,
  state: 'ready',
};

const markSessionReady = (frame: HTMLIFrameElement) => {
  const marker = frame.contentDocument!.createElement('meta');
  marker.setAttribute('content', 'ready');
  marker.setAttribute('name', 'askcore-session');
  frame.contentDocument!.head.append(marker);
};

vi.mock('swr', () => ({
  default: (key: string | null) => ({ data: key ? portal : undefined }),
  useSWRConfig: () => ({ mutate }),
}));

vi.mock('@/libs/better-auth/auth-client', () => ({
  useSession: () => ({ data: state.authenticated ? { user: { id: state.userId } } : null }),
}));

vi.mock('@/business/client/AskCoreSchoolPortal/api', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchSchoolSourceSession,
}));

describe('BusinessGlobalProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mutate.mockReset();
    fetchSchoolSourceSession.mockReset();
    fetchSchoolSourceSession.mockRejectedValue(new Error('source session is not ready'));
    state.authenticated = true;
    state.userId = 'user-1';
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('warms Gibbon and Moodle sessions without replacing the personal workspace', () => {
    render(
      <BusinessGlobalProvider>
        <div>personal workspace</div>
      </BusinessGlobalProvider>,
    );

    expect(screen.getByText('personal workspace')).toBeInTheDocument();
    let frames = document.querySelectorAll<HTMLIFrameElement>(
      'iframe[data-askcore-school-session]',
    );
    expect(frames).toHaveLength(1);
    expect(frames[0]?.dataset.askcoreSchoolSession).toBe('school-services');
    expect(frames[0]?.getAttribute('src')).toBe('about:blank#services-session');
    expect(frames[0]?.hidden).toBe(true);

    markSessionReady(frames[0]!);
    fireEvent.load(frames[0]!);
    expect(mutate).toHaveBeenCalledWith([
      'https://askcore.cn/school/services/askcore/session.php',
      'user-1',
    ]);

    frames = document.querySelectorAll<HTMLIFrameElement>('iframe[data-askcore-school-session]');
    expect(frames).toHaveLength(1);
    expect(frames[0]?.dataset.askcoreSchoolSession).toBe('teaching');
    markSessionReady(frames[0]!);
    fireEvent.load(frames[0]!);
    expect(document.querySelectorAll('iframe[data-askcore-school-session]')).toHaveLength(0);
  });

  it('continues after Gibbon establishes a source role on its native dashboard', async () => {
    fetchSchoolSourceSession.mockResolvedValue({ authenticated: true, role: 'teacher' });
    render(
      <BusinessGlobalProvider>
        <div>personal workspace</div>
      </BusinessGlobalProvider>,
    );

    const gibbonFrame = document.querySelector<HTMLIFrameElement>(
      'iframe[data-askcore-school-session="school-services"]',
    );
    await act(async () => {
      fireEvent.load(gibbonFrame!);
      await Promise.resolve();
    });

    expect(fetchSchoolSourceSession).toHaveBeenCalledWith(
      'https://askcore.cn/school/services/askcore/session.php',
    );
    expect(mutate).toHaveBeenCalledWith(
      ['https://askcore.cn/school/services/askcore/session.php', 'user-1'],
      { authenticated: true, role: 'teacher' },
      { revalidate: false },
    );
    expect(
      document.querySelector<HTMLIFrameElement>('iframe[data-askcore-school-session="teaching"]'),
    ).not.toBeNull();
  });

  it('does not contact school sources before Better Auth is authenticated', () => {
    state.authenticated = false;

    render(
      <BusinessGlobalProvider>
        <div>sign in</div>
      </BusinessGlobalProvider>,
    );

    expect(document.querySelector('iframe[data-askcore-school-session]')).toBeNull();
  });

  it('does not warm source sessions until a directed identity invitation is accepted', () => {
    window.history.replaceState(
      {},
      '',
      '/askcore/workbench?protocol=identity-link&token=opaque-invitation',
    );

    render(
      <BusinessGlobalProvider>
        <div>link identity first</div>
      </BusinessGlobalProvider>,
    );

    expect(screen.getByText('link identity first')).toBeInTheDocument();
    expect(document.querySelector('iframe[data-askcore-school-session]')).toBeNull();
  });

  it('stops a source flow that never reports a ready session', () => {
    render(
      <BusinessGlobalProvider>
        <div>personal workspace</div>
      </BusinessGlobalProvider>,
    );

    const frame = document.querySelector<HTMLIFrameElement>('iframe[data-askcore-school-session]');
    expect(frame?.dataset.askcoreSchoolSession).toBe('school-services');
    fireEvent.load(frame!);
    expect(mutate).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(30_000));
    expect(document.querySelector('iframe[data-askcore-school-session]')).toBeNull();
  });
});
