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
  portalAvailable: true,
  role: undefined as 'administrator' | 'student' | 'teacher' | undefined,
  roleError: false,
  roleValidating: false,
  schoolState: 'ready' as 'ready' | 'unavailable',
}));

const requestedRoleKeys = vi.hoisted(() => [] as unknown[]);
const requestedPortalKeys = vi.hoisted(() => [] as unknown[]);
const primeSchoolPortalBootstrap = vi.hoisted(() => vi.fn());

vi.mock('@/business/client/AskCoreSchoolPortal/api', async (importOriginal) => ({
  ...(await importOriginal()),
  primeSchoolPortalBootstrap,
}));

vi.mock('@/libs/better-auth/auth-client', () => ({
  useSession: () => ({
    data: {
      session: { id: swrState.accountSessionId },
      user: { id: swrState.accountUserId },
    },
  }),
}));

vi.mock('swr', () => ({
  default: (key: readonly string[] | string | null) => {
    if (Array.isArray(key) && key[0] === '/api/askcore/school/portal') {
      requestedPortalKeys.push(key);
      if (!swrState.portalAvailable) return { data: undefined, error: new Error('unavailable') };
      return {
        data: {
          schools:
            swrState.schoolState === 'ready'
              ? [
                  {
                    destinations: [
                      {
                        key: 'teaching',
                        launch_url: '/api/askcore/school/launch/teaching',
                      },
                    ],
                    role_source_url: 'https://askcore.cn/school/services/askcore/session.php',
                  },
                ]
              : [],
          show_school_entry: true,
          state: swrState.schoolState,
        },
      };
    }
    if (Array.isArray(key) && key[0] === '/school/services/askcore/session.php') {
      requestedRoleKeys.push(key);
      return {
        data: swrState.role ? { authenticated: true, role: swrState.role } : undefined,
        error: swrState.roleError ? new Error('role unavailable') : undefined,
        isValidating: swrState.roleValidating,
      };
    }
    return { data: undefined };
  },
}));

beforeEach(() => {
  requestedRoleKeys.length = 0;
  requestedPortalKeys.length = 0;
  primeSchoolPortalBootstrap.mockReset();
  swrState.accountUserId = 'user-1';
  swrState.accountSessionId = 'session-1';
  swrState.portalAvailable = true;
  swrState.schoolState = 'ready';
  swrState.role = undefined;
  swrState.roleError = false;
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
  it('primes school data and shares the visible school portal cache scope', () => {
    renderHook(() => useNavLayout(), { wrapper: SchoolRouter });

    expect(primeSchoolPortalBootstrap).toHaveBeenCalled();
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

  it('always shows school while the shared source is unavailable', () => {
    swrState.schoolState = 'unavailable';
    swrState.role = undefined;

    const items = visibleItems();

    expect(items.map((item) => item.title)).toContain('学校');
    expect(items.map((item) => item.title)).not.toContain('教学中心');
    expect(items.map((item) => item.title)).not.toContain('学习空间');
  });

  it('shows learning space only for a live Gibbon student', () => {
    swrState.schoolState = 'ready';
    swrState.role = 'student';

    const items = visibleItems();

    expect(items.map((item) => item.title)).toEqual(expect.arrayContaining(['学校', '学习空间']));
    expect(items.map((item) => item.title)).not.toContain('教学中心');
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

  it.each(['validating', 'failed'] as const)('hides a stale positive role while %s', (state) => {
    swrState.role = 'student';
    swrState.roleValidating = state === 'validating';
    swrState.roleError = state === 'failed';

    const items = visibleItems();

    expect(items.map((item) => item.title)).toContain('学校');
    expect(items.map((item) => item.title)).not.toContain('学习空间');
    expect(items.map((item) => item.title)).not.toContain('教学中心');
  });

  it.each(['teacher', 'administrator'] as const)(
    'shows teaching center only for a live Gibbon %s',
    (role) => {
      swrState.schoolState = 'ready';
      swrState.role = role;

      const items = visibleItems();

      expect(items.map((item) => item.title)).toEqual(expect.arrayContaining(['学校', '教学中心']));
      expect(items.map((item) => item.title)).not.toContain('学习空间');
      expect(items.find((item) => item.title === '教学中心')?.url).toBe('/school/teaching-center');
    },
  );
});
