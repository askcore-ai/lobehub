import { renderHook } from '@testing-library/react';
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
  portalAvailable: true,
  role: undefined as 'administrator' | 'student' | 'teacher' | undefined,
  schoolState: 'ready' as 'ready' | 'unavailable',
}));

const requestedRoleKeys = vi.hoisted(() => [] as unknown[]);

vi.mock('@/libs/better-auth/auth-client', () => ({
  useSession: () => ({ data: { user: { id: swrState.accountUserId } } }),
}));

vi.mock('swr', () => ({
  default: (key: readonly string[] | string | null) => {
    if (Array.isArray(key) && key[0] === '/api/askcore/school/portal') {
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
    if (Array.isArray(key) && key[0] === 'https://askcore.cn/school/services/askcore/session.php') {
      requestedRoleKeys.push(key);
      return { data: swrState.role ? { authenticated: true, role: swrState.role } : undefined };
    }
    return { data: undefined };
  },
}));

beforeEach(() => {
  requestedRoleKeys.length = 0;
  swrState.accountUserId = 'user-1';
  swrState.portalAvailable = true;
  swrState.schoolState = 'ready';
  swrState.role = undefined;
});

afterEach(() => vi.unstubAllGlobals());

const visibleItems = () => {
  const { result } = renderHook(() => useNavLayout());
  return result.current.topNavItems.filter((item) => !item.hidden);
};

describe('useNavLayout source-role school navigation', () => {
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
    expect(items.find((item) => item.title === '学习空间')?.url).toBe(
      '/api/askcore/school/launch/teaching',
    );
    expect(requestedRoleKeys).toContainEqual([
      'https://askcore.cn/school/services/askcore/session.php',
      'user-1',
    ]);
  });

  it.each(['teacher', 'administrator'] as const)(
    'shows teaching center only for a live Gibbon %s',
    (role) => {
      swrState.schoolState = 'ready';
      swrState.role = role;

      const items = visibleItems();

      expect(items.map((item) => item.title)).toEqual(expect.arrayContaining(['学校', '教学中心']));
      expect(items.map((item) => item.title)).not.toContain('学习空间');
    },
  );
});
