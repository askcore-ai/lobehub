// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BusinessGlobalProvider from './BusinessGlobalProvider';

const state = vi.hoisted(() => ({ authenticated: true }));
const mutate = vi.hoisted(() => vi.fn());

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

vi.mock('swr', () => ({
  default: (key: string | null) => ({ data: key ? portal : undefined }),
  useSWRConfig: () => ({ mutate }),
}));

vi.mock('@/libs/better-auth/auth-client', () => ({
  useSession: () => ({ data: state.authenticated ? { user: { id: 'user-1' } } : null }),
}));

describe('BusinessGlobalProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mutate.mockReset();
    state.authenticated = true;
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

    fireEvent.load(frames[0]!);
    expect(mutate).toHaveBeenCalledWith('https://askcore.cn/school/services/askcore/session.php');

    act(() => vi.advanceTimersByTime(3000));
    frames = document.querySelectorAll<HTMLIFrameElement>('iframe[data-askcore-school-session]');
    expect(frames).toHaveLength(2);
    expect(frames[1]?.dataset.askcoreSchoolSession).toBe('teaching');
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
});
