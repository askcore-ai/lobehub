import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import zhSetting from '../../../../../locales/zh-CN/setting.json';
import zhSubscription from '../../../../../locales/zh-CN/subscription.json';
import { mapFeatureFlagsEnvToState } from '@/config/featureFlags';
import { SettingsTabs } from '@/store/global/initialState';
import { initServerConfigStore, Provider } from '@/store/serverConfig/store';
import { useUserStore } from '@/store/user';

import { useCategory } from './useCategory';

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn(() => null),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    },
  });
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const createWrapper = (
  showProvider: boolean,
  options: { enableAskCoreBilling?: boolean; enableBusinessFeatures?: boolean } = {},
) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider
      createStore={() =>
        initServerConfigStore({
          featureFlags: {
            ...mapFeatureFlagsEnvToState({
              provider_settings: true,
            }),
            showProvider,
          },
          serverConfig: {
            aiProvider: {},
            enableAskCoreBilling: options.enableAskCoreBilling,
            enableBusinessFeatures: options.enableBusinessFeatures,
            telemetry: {},
          },
        })
      }
    >
      {children}
    </Provider>
  );

  return Wrapper;
};

const getItemKeys = () => {
  const { result } = renderHook(() => useCategory(), {
    wrapper: createWrapper(true),
  });

  return result.current.flatMap((group) => group.items.map((item) => item.key));
};

const initialUserStoreState = useUserStore.getState();

afterEach(() => {
  useUserStore.setState(initialUserStoreState, true);
});

describe('settings useCategory', () => {
  it('keeps Provider visible when provider settings are enabled', () => {
    expect(getItemKeys()).toContain(SettingsTabs.Provider);
  });

  it('hides Provider when provider settings are disabled', () => {
    const { result } = renderHook(() => useCategory(), {
      wrapper: createWrapper(false),
    });

    const keys = result.current.flatMap((group) => group.items.map((item) => item.key));

    expect(keys).not.toContain(SettingsTabs.Provider);
  });

  it('places school affairs and school plans in Settings when school features are enabled', () => {
    const { result } = renderHook(() => useCategory(), {
      wrapper: createWrapper(true, {
        enableAskCoreBilling: true,
        enableBusinessFeatures: true,
      }),
    });
    const keys = result.current.flatMap((group) => group.items.map((item) => item.key));

    expect(keys).toContain(SettingsTabs.SchoolAffairs);
    expect(keys).toContain(SettingsTabs.SchoolPlan);
    expect(keys).toContain(SettingsTabs.Plans);
    expect(zhSetting['tab.schoolAffairs']).toBe('校务');
    expect(zhSetting['tab.schoolPlan']).toBe('学校套餐');
    expect(zhSubscription['tab.plans']).toBe('个人套餐');
  });

  it('does not expose school Settings when business features are disabled', () => {
    const { result } = renderHook(() => useCategory(), {
      wrapper: createWrapper(true, {
        enableAskCoreBilling: true,
        enableBusinessFeatures: false,
      }),
    });
    const keys = result.current.flatMap((group) => group.items.map((item) => item.key));

    expect(keys).not.toContain(SettingsTabs.SchoolAffairs);
    expect(keys).not.toContain(SettingsTabs.SchoolPlan);
  });
});
