// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (state: any) => unknown) =>
    selector({ toggleCommandMenu: vi.fn() }),
}));
vi.mock('@/store/serverConfig', () => ({
  featureFlagsSelectors: {},
  useServerConfigStore: () => ({ hideGitHub: true, showMarket: false }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('P140 single school navigation', () => {
  it.each(['student', 'teacher', 'administrator', 'guardian'])(
    'shows one stable School / Learning Space entry for %s',
    async () => {
      const { useNavLayout } = await import('./useNavLayout');
      const { result } = renderHook(() => useNavLayout());
      const schoolItems = result.current.topNavItems.filter((item) => item.url === '/school');

      expect(schoolItems).toHaveLength(1);
      expect(schoolItems[0]?.title).toBe('schoolPortal.surface.schoolLearningSpace');
      expect(result.current.topNavItems.some((item) => item.url?.startsWith('/school/'))).toBe(
        false,
      );
    },
  );
});
