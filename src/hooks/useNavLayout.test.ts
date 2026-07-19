import { act, renderHook } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNavLayout } from './useNavLayout';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/config/routes', () => ({
  getRouteById: () => ({ icon: () => null }),
}));

vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (state: { toggleCommandMenu: () => void }) => unknown) =>
    selector({ toggleCommandMenu: vi.fn() }),
}));

vi.mock('@/store/serverConfig', () => ({
  featureFlagsSelectors: (state: { featureFlags: { hideGitHub: boolean; showMarket: boolean } }) =>
    state.featureFlags,
  useServerConfigStore: (
    selector: (state: { featureFlags: { hideGitHub: boolean; showMarket: boolean } }) => unknown,
  ) => selector({ featureFlags: { hideGitHub: false, showMarket: true } }),
}));

const swrState = vi.hoisted(() => ({
  accountUserId: 'user-1',
  accountSessionId: 'session-1',
  bootstrapPortal: false,
  bootstrapRole: false,
  portalAvailable: true,
  portalValidating: false,
  role: undefined as 'administrator' | 'student' | 'teacher' | undefined,
  roleAuthenticated: true,
  roleError: false,
  roleErrorStatus: undefined as number | undefined,
  roleValidating: false,
  schoolState: 'ready' as 'ready' | 'unavailable',
  sessionPending: false,
  sessionRefetching: false,
}));
const rolePayloads = vi.hoisted(() => ({
  administrator: { authenticated: true as const, role: 'administrator' as const },
  student: { authenticated: true as const, role: 'student' as const },
  teacher: { authenticated: true as const, role: 'teacher' as const },
  unauthenticated: { authenticated: false as const },
}));
const portalPayloads = vi.hoisted(() => ({
  ready: {
    schools: [
      {
        destinations: [
          {
            key: 'teaching',
            launch_url: '/api/askcore/school/launch/teaching',
          },
        ],
        role_source_url: 'https://askcore.cn/school/services/askcore/session.php',
      },
    ],
    show_school_entry: true,
    state: 'ready' as const,
  },
  unavailable: {
    schools: [],
    show_school_entry: true,
    state: 'unavailable' as const,
  },
}));

const requestedRoleKeys = vi.hoisted(() => [] as unknown[]);
const requestedPortalKeys = vi.hoisted(() => [] as unknown[]);
const requestedRoleOptions = vi.hoisted(() => [] as Record<string, unknown>[]);
const requestedPortalOptions = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock('@/libs/better-auth/auth-client', () => ({
  useSession: () => ({
    data: {
      session: { id: swrState.accountSessionId },
      user: { id: swrState.accountUserId },
    },
    isPending: swrState.sessionPending,
    isRefetching: swrState.sessionRefetching,
  }),
}));

vi.mock('@/business/client/AskCoreSchoolPortal/api', async (importOriginal) => ({
  ...(await importOriginal()),
  readSchoolPortalBootstrapSnapshot: () =>
    (swrState.bootstrapPortal || swrState.bootstrapRole) && swrState.role
      ? {
          portal: swrState.bootstrapPortal ? portalPayloads[swrState.schoolState] : undefined,
          sourceSession: swrState.bootstrapRole ? rolePayloads[swrState.role] : undefined,
        }
      : undefined,
}));

vi.mock('swr', () => ({
  default: (
    key: readonly string[] | string | null,
    _fetcher: unknown,
    options: Record<string, unknown> = {},
  ) => {
    if (Array.isArray(key) && key[0] === '/api/askcore/school/portal') {
      requestedPortalKeys.push(key);
      requestedPortalOptions.push(options);
      if (!swrState.portalAvailable) return { data: undefined, error: new Error('unavailable') };
      return {
        data: portalPayloads[swrState.schoolState],
        isValidating: swrState.portalValidating,
      };
    }
    if (Array.isArray(key) && key[0] === '/school/services/askcore/session.php') {
      requestedRoleKeys.push(key);
      requestedRoleOptions.push(options);
      const roleError = swrState.roleError ? new Error('role unavailable') : undefined;
      if (roleError && swrState.roleErrorStatus) {
        Object.assign(roleError, { status: swrState.roleErrorStatus });
      }
      return {
        data: swrState.role
          ? swrState.roleAuthenticated
            ? rolePayloads[swrState.role]
            : rolePayloads.unauthenticated
          : undefined,
        error: roleError,
        isValidating: swrState.roleValidating,
      };
    }
    return { data: undefined };
  },
}));

beforeEach(() => {
  requestedRoleKeys.length = 0;
  requestedPortalKeys.length = 0;
  requestedRoleOptions.length = 0;
  requestedPortalOptions.length = 0;
  swrState.accountUserId = 'user-1';
  swrState.accountSessionId = 'session-1';
  swrState.bootstrapPortal = false;
  swrState.bootstrapRole = false;
  swrState.portalAvailable = true;
  swrState.portalValidating = false;
  swrState.schoolState = 'ready';
  swrState.sessionPending = false;
  swrState.sessionRefetching = false;
  swrState.role = undefined;
  swrState.roleAuthenticated = true;
  swrState.roleError = false;
  swrState.roleErrorStatus = undefined;
  swrState.roleValidating = false;
});

afterEach(() => vi.unstubAllGlobals());

const visibleItems = () => {
  const { result } = renderHook(() => useNavLayout(), { wrapper: Router });
  return result.current.topNavItems.filter((item) => !item.hidden);
};

const Router = ({ children }: PropsWithChildren) => createElement(MemoryRouter, null, children);

const SchoolRouter = ({ children }: PropsWithChildren) =>
  createElement(MemoryRouter, { initialEntries: ['/school'] }, children);

describe('useNavLayout source-role school navigation', () => {
  it('shares the visible school portal cache scope', () => {
    renderHook(() => useNavLayout(), { wrapper: SchoolRouter });

    expect(requestedPortalKeys).toContainEqual([
      '/api/askcore/school/portal',
      'user-1:session-1',
      'school-services',
    ]);
  });

  it('keeps school visible while the portal request is unavailable', () => {
    swrState.portalAvailable = false;
    swrState.role = undefined;

    const items = visibleItems();

    expect(items.map((item) => item.title)).toContain('学校');
    swrState.portalAvailable = true;
  });

  it('retries initial transient school bootstrap failures without retrying authorization loss', () => {
    vi.useFakeTimers();
    try {
      renderHook(() => useNavLayout(), { wrapper: SchoolRouter });
      const transientError = Object.assign(new Error('unavailable'), { status: 503 });
      const deniedError = Object.assign(new Error('denied'), { status: 401 });

      for (const rawOptions of [requestedPortalOptions.at(-1), requestedRoleOptions.at(-1)]) {
        const options = rawOptions as {
          onErrorRetry: (
            error: unknown,
            key: unknown,
            config: unknown,
            revalidate: (options: { retryCount: number }) => void,
            context: { retryCount: number },
          ) => void;
          shouldRetryOnError: (error: unknown) => boolean;
        };
        const revalidate = vi.fn();

        expect(options.shouldRetryOnError(transientError)).toBe(true);
        expect(options.shouldRetryOnError(deniedError)).toBe(false);

        options.onErrorRetry(transientError, [], {}, revalidate, { retryCount: 1 });
        act(() => vi.runOnlyPendingTimers());
        expect(revalidate).toHaveBeenCalledWith({ retryCount: 1 });

        revalidate.mockClear();
        options.onErrorRetry(deniedError, [], {}, revalidate, { retryCount: 1 });
        options.onErrorRetry(transientError, [], {}, revalidate, { retryCount: 3 });
        act(() => vi.runOnlyPendingTimers());
        expect(revalidate).not.toHaveBeenCalled();
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels a scheduled school bootstrap retry after the account session changes', () => {
    vi.useFakeTimers();
    try {
      const view = renderHook(() => useNavLayout(), { wrapper: SchoolRouter });
      const options = requestedRoleOptions.at(-1) as {
        onErrorRetry: (
          error: unknown,
          key: unknown,
          config: unknown,
          revalidate: (options: { retryCount: number }) => void,
          context: { retryCount: number },
        ) => void;
      };
      const revalidate = vi.fn();

      options.onErrorRetry(new Error('unavailable'), [], {}, revalidate, { retryCount: 1 });
      swrState.accountSessionId = 'session-2';
      view.rerender();
      swrState.accountSessionId = 'session-1';
      view.rerender();
      act(() => vi.runOnlyPendingTimers());

      expect(revalidate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('always shows school while the shared source is unavailable', () => {
    swrState.schoolState = 'unavailable';
    swrState.role = undefined;

    const items = visibleItems();

    expect(items.map((item) => item.title)).toContain('学校');
    expect(items.map((item) => item.title)).not.toContain('教学中心');
    expect(items.map((item) => item.title)).not.toContain('学习空间');
    expect(items.map((item) => item.title)).not.toContain('运维中心');
    expect(items.map((item) => item.title)).not.toContain('schoolPortal.surface.billing');
  });

  it('shows learning space only for a live Gibbon student', () => {
    swrState.schoolState = 'ready';
    swrState.role = 'student';

    const items = visibleItems();

    expect(items.map((item) => item.title)).toEqual(
      expect.arrayContaining(['学校', '学习空间', 'schoolPortal.surface.billing']),
    );
    expect(items.find((item) => item.title === 'schoolPortal.surface.billing')?.url).toBe(
      '/school/billing',
    );
    expect(items.map((item) => item.title)).not.toContain('教学中心');
    expect(items.map((item) => item.title)).not.toContain('运维中心');
    expect(items.find((item) => item.title === '学习空间')?.url).toBe('/school/learning-space');
    expect(requestedRoleKeys).toContainEqual([
      '/school/services/askcore/session.php',
      'user-1:session-1',
    ]);
  });

  it('keeps the account-session role cache key stable after a BFCache restore', () => {
    swrState.role = 'student';
    const { result } = renderHook(() => useNavLayout(), { wrapper: Router });

    expect(result.current.topNavItems.find((item) => item.title === '学习空间')?.hidden).toBe(
      false,
    );

    const pageshow = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(pageshow, 'persisted', { value: true });
    act(() => window.dispatchEvent(pageshow));

    expect(requestedRoleKeys).not.toContainEqual([
      '/school/services/askcore/session.php',
      'user-1:session-1',
      1,
    ]);
    expect(requestedRoleKeys).toEqual(
      expect.arrayContaining([['/school/services/askcore/session.php', 'user-1:session-1']]),
    );
  });

  it('keeps an exact portal-role snapshot visible while live validation is pending', () => {
    swrState.bootstrapPortal = true;
    swrState.bootstrapRole = true;
    swrState.role = 'student';
    swrState.portalValidating = true;
    swrState.roleValidating = true;

    const items = visibleItems();

    expect(items.map((item) => item.title)).toContain('学校');
    expect(items.map((item) => item.title)).toContain('学习空间');
    expect(items.map((item) => item.title)).not.toContain('教学中心');
  });

  it('hides a partial bootstrap role while the paired portal is validating', () => {
    swrState.bootstrapRole = true;
    swrState.role = 'student';
    swrState.portalValidating = true;

    const items = visibleItems();

    expect(items.map((item) => item.title)).toContain('学校');
    expect(items.map((item) => item.title)).not.toContain('学习空间');
    expect(items.map((item) => item.title)).not.toContain('教学中心');
  });

  it('hides an arbitrary SWR role while its live validation is pending', () => {
    swrState.role = 'student';
    swrState.roleValidating = true;

    const items = visibleItems();

    expect(items.map((item) => item.title)).toContain('学校');
    expect(items.map((item) => item.title)).not.toContain('学习空间');
    expect(items.map((item) => item.title)).not.toContain('教学中心');
  });

  it('keeps a previously live-confirmed role during same-generation source revalidation', () => {
    swrState.role = 'student';
    const view = renderHook(() => useNavLayout(), { wrapper: Router });
    expect(view.result.current.topNavItems.find((item) => item.title === '学习空间')?.hidden).toBe(
      false,
    );

    swrState.roleValidating = true;
    view.rerender();

    expect(view.result.current.topNavItems.find((item) => item.title === '学习空间')?.hidden).toBe(
      false,
    );
  });

  it('keeps a previously live-confirmed role during a transient same-generation source error', () => {
    swrState.role = 'student';
    const view = renderHook(() => useNavLayout(), { wrapper: Router });

    swrState.roleError = true;
    view.rerender();

    expect(view.result.current.topNavItems.find((item) => item.title === '学习空间')?.hidden).toBe(
      false,
    );
  });

  it('keeps a confirmed role while Better Auth refetches the same account session', () => {
    swrState.role = 'student';
    const view = renderHook(() => useNavLayout(), { wrapper: Router });
    expect(view.result.current.topNavItems.find((item) => item.title === '学习空间')?.hidden).toBe(
      false,
    );

    swrState.sessionRefetching = true;
    view.rerender();

    expect(view.result.current.topNavItems.find((item) => item.title === '学习空间')?.hidden).toBe(
      false,
    );
  });

  it('hides a stale positive role when its live validation fails', () => {
    swrState.role = 'student';
    swrState.roleError = true;
    swrState.roleErrorStatus = 401;

    const items = visibleItems();

    expect(items.map((item) => item.title)).toContain('学校');
    expect(items.map((item) => item.title)).not.toContain('学习空间');
    expect(items.map((item) => item.title)).not.toContain('教学中心');
  });

  it('clears a confirmed role when the source explicitly becomes unauthenticated', () => {
    swrState.role = 'student';
    const view = renderHook(() => useNavLayout(), { wrapper: Router });
    expect(view.result.current.topNavItems.find((item) => item.title === '学习空间')?.hidden).toBe(
      false,
    );

    swrState.roleAuthenticated = false;
    view.rerender();

    expect(view.result.current.topNavItems.find((item) => item.title === '学习空间')?.hidden).toBe(
      true,
    );
  });

  it('shows teaching center only for a live Gibbon teacher', () => {
    swrState.schoolState = 'ready';
    swrState.role = 'teacher';

    const items = visibleItems();

    expect(items.map((item) => item.title)).toEqual(expect.arrayContaining(['学校', '教学中心']));
    expect(items.map((item) => item.title)).not.toContain('学习空间');
    expect(items.map((item) => item.title)).not.toContain('运维中心');
    expect(items.find((item) => item.title === '教学中心')?.url).toBe('/school/teaching-center');
  });

  it('shows teaching and operations centers for a live Gibbon administrator', () => {
    swrState.schoolState = 'ready';
    swrState.role = 'administrator';

    const items = visibleItems();

    expect(items.map((item) => item.title)).toEqual(
      expect.arrayContaining(['学校', '教学中心', '运维中心']),
    );
    expect(items.map((item) => item.title)).toContain('schoolPortal.surface.billing');
    expect(items.map((item) => item.title)).not.toContain('学习空间');
    expect(items.find((item) => item.title === '教学中心')?.url).toBe('/school/teaching-center');
    expect(items.find((item) => item.title === '运维中心')?.url).toBe('/school/operations-center');
  });
});
