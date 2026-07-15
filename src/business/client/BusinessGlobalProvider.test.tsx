// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BusinessGlobalProvider from './BusinessGlobalProvider';

const state = vi.hoisted(() => ({
  authenticated: true,
  liveRole: undefined as { authenticated: true; role: 'student' | 'teacher' } | undefined,
  portalValidating: false,
  roleError: true,
  sessionId: 'session-1',
  userId: 'user-1',
}));
const fetchSchoolSourceSession = vi.hoisted(() => vi.fn());
const mutateRole = vi.hoisted(() => vi.fn());
const requestedKeys = vi.hoisted(() => [] as (readonly string[])[]);

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

const renderProvider = (initialEntry = '/') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <BusinessGlobalProvider>
        <div>personal workspace</div>
      </BusinessGlobalProvider>
    </MemoryRouter>,
  );

vi.mock('swr', () => ({
  default: (key: readonly string[] | null) => {
    if (!key) return { data: undefined, isValidating: false, mutate: vi.fn() };
    requestedKeys.push(key);
    if (key[0] === '/api/askcore/school/portal') {
      return { data: portal, isValidating: state.portalValidating, mutate: vi.fn() };
    }
    return {
      data: state.liveRole,
      error: state.roleError ? new Error('source session is not ready') : undefined,
      isValidating: false,
      mutate: mutateRole,
    };
  },
}));

vi.mock('@/libs/better-auth/auth-client', () => ({
  useSession: () => ({
    data: state.authenticated
      ? { session: { id: state.sessionId }, user: { id: state.userId } }
      : null,
  }),
}));

vi.mock('@/business/client/AskCoreSchoolPortal/api', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchSchoolSourceSession,
}));

describe('BusinessGlobalProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchSchoolSourceSession.mockReset();
    fetchSchoolSourceSession.mockRejectedValue(new Error('source session is not ready'));
    mutateRole.mockReset();
    mutateRole.mockImplementation(() =>
      fetchSchoolSourceSession('/school/services/askcore/session.php'),
    );
    state.authenticated = true;
    state.liveRole = undefined;
    state.portalValidating = false;
    state.roleError = true;
    state.sessionId = 'session-1';
    state.userId = 'user-1';
    requestedKeys.length = 0;
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('warms Gibbon and Moodle sessions without replacing the personal workspace', async () => {
    fetchSchoolSourceSession.mockResolvedValue({ authenticated: true, role: 'student' });
    renderProvider();

    expect(screen.getByText('personal workspace')).toBeInTheDocument();
    let frames = document.querySelectorAll<HTMLIFrameElement>(
      'iframe[data-askcore-school-session]',
    );
    expect(frames).toHaveLength(1);
    expect(frames[0]?.dataset.askcoreSchoolSession).toBe('school-services');
    expect(frames[0]?.getAttribute('src')).toBe('about:blank#services-session');
    expect(frames[0]?.hidden).toBe(true);
    expect(requestedKeys).toContainEqual([
      '/school/services/askcore/session.php',
      'user-1:session-1',
      0,
    ]);

    markSessionReady(frames[0]!);
    await act(async () => {
      fireEvent.load(frames[0]!);
      await Promise.resolve();
    });
    expect(mutateRole).toHaveBeenCalledTimes(1);

    frames = document.querySelectorAll<HTMLIFrameElement>('iframe[data-askcore-school-session]');
    expect(frames).toHaveLength(1);
    expect(frames[0]?.dataset.askcoreSchoolSession).toBe('teaching');
    markSessionReady(frames[0]!);
    fireEvent.load(frames[0]!);
    expect(document.querySelectorAll('iframe[data-askcore-school-session]')).toHaveLength(0);
  });

  it('moves the shared source-session cache generation after a BFCache restore', () => {
    renderProvider();

    const pageshow = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(pageshow, 'persisted', { value: true });
    act(() => window.dispatchEvent(pageshow));

    expect(requestedKeys).toContainEqual([
      '/school/services/askcore/session.php',
      'user-1:session-1',
      1,
    ]);
    expect(requestedKeys).toContainEqual(['/api/askcore/school/portal', 'user-1:session-1', 1]);
  });

  it('continues after Gibbon establishes a source role on its native dashboard', async () => {
    fetchSchoolSourceSession.mockResolvedValue({ authenticated: true, role: 'teacher' });
    renderProvider();

    const gibbonFrame = document.querySelector<HTMLIFrameElement>(
      'iframe[data-askcore-school-session="school-services"]',
    );
    await act(async () => {
      fireEvent.load(gibbonFrame!);
      await Promise.resolve();
    });

    expect(fetchSchoolSourceSession).toHaveBeenCalledWith('/school/services/askcore/session.php');
    expect(mutateRole).toHaveBeenCalledTimes(1);
    expect(
      document.querySelector<HTMLIFrameElement>('iframe[data-askcore-school-session="teaching"]'),
    ).not.toBeNull();
  });

  it('does not contact school sources before Better Auth is authenticated', () => {
    state.authenticated = false;

    renderProvider();

    expect(document.querySelector('iframe[data-askcore-school-session]')).toBeNull();
  });

  it('does not launch cached source-session tokens while the portal is refreshing', () => {
    state.portalValidating = true;

    renderProvider();

    expect(document.querySelector('iframe[data-askcore-school-session]')).toBeNull();
  });

  it('does not trust a cached positive role after the live role probe fails', () => {
    state.liveRole = { authenticated: true, role: 'student' };
    state.roleError = true;

    renderProvider();

    const frame = document.querySelector<HTMLIFrameElement>('iframe[data-askcore-school-session]');
    expect(frame?.dataset.askcoreSchoolSession).toBe('school-services');
    expect(document.querySelector('iframe[data-askcore-school-session="teaching"]')).toBeNull();
  });

  it('does not warm source sessions until a directed identity invitation is accepted', () => {
    window.history.replaceState(
      {},
      '',
      '/askcore/workbench?protocol=identity-link&token=opaque-invitation',
    );

    renderProvider('/askcore/workbench?protocol=identity-link&token=opaque-invitation');

    expect(screen.getByText('personal workspace')).toBeInTheDocument();
    expect(document.querySelector('iframe[data-askcore-school-session]')).toBeNull();
  });

  it('does not race a visible school surface with a hidden source login', () => {
    renderProvider('/school');

    expect(screen.getByText('personal workspace')).toBeInTheDocument();
    expect(document.querySelector('iframe[data-askcore-school-session]')).toBeNull();
  });

  it('stops a source flow that never reports a ready session', () => {
    renderProvider();

    const frame = document.querySelector<HTMLIFrameElement>('iframe[data-askcore-school-session]');
    expect(frame?.dataset.askcoreSchoolSession).toBe('school-services');
    fireEvent.load(frame!);
    expect(mutateRole).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(30_000));
    expect(document.querySelector('iframe[data-askcore-school-session]')).toBeNull();
  });
});
