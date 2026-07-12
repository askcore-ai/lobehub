import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

const swrState = vi.hoisted(() => ({ showSchoolEntry: false }));

vi.mock('swr', () => ({
  default: () => ({
    data: {
      show_school_entry: swrState.showSchoolEntry,
    },
  }),
}));

afterEach(() => vi.unstubAllGlobals());

describe('useNavLayout LMS-owned teaching boundary', () => {
  it('does not expose school navigation for a personal-only user', () => {
    swrState.showSchoolEntry = false;
    const { result } = renderHook(() => useNavLayout());
    const visibleUrls = result.current.topNavItems
      .filter((item) => !item.hidden)
      .map((item) => item.url)
      .filter(Boolean);

    expect(visibleUrls).not.toContain('/school');
    expect(visibleUrls).not.toContain('/organization');
    expect(visibleUrls).not.toContain('/askcore/workbench');
  });

  it('shows one school entry for a linked user', () => {
    swrState.showSchoolEntry = true;
    const { result } = renderHook(() => useNavLayout());
    const visibleUrls = result.current.topNavItems
      .filter((item) => !item.hidden)
      .map((item) => item.url);

    expect(visibleUrls.filter((url) => url === '/school')).toHaveLength(1);
  });
});
