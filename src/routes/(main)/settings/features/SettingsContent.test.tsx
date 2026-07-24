import { render, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import type * as ReactRouter from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsTabs } from '@/store/global/initialState';
import { initServerConfigStore, Provider } from '@/store/serverConfig/store';

import SettingsContent from './SettingsContent';

const navigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router-dom');

  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

const ServerConfigProvider = ({ children }: { children: ReactNode }) => (
  <Provider
    createStore={() =>
      initServerConfigStore({
        serverConfig: {
          aiProvider: {},
          enableAskCoreBilling: true,
          enableBusinessFeatures: false,
          telemetry: {},
        },
      })
    }
  >
    {children}
  </Provider>
);

afterEach(() => {
  navigate.mockReset();
});

describe('SettingsContent school route guard', () => {
  it.each([
    [SettingsTabs.SchoolAffairs, false, '/settings/profile'],
    [SettingsTabs.SchoolPlan, false, '/settings/profile'],
    [SettingsTabs.SchoolAffairs, true, '/me/settings'],
    [SettingsTabs.SchoolPlan, true, '/me/settings'],
  ])(
    'redirects unavailable %s on mobile=%s without rendering it',
    async (activeTab, mobile, expectedRoute) => {
      const { container } = render(
        <ServerConfigProvider>
          <SettingsContent activeTab={activeTab} mobile={mobile} />
        </ServerConfigProvider>,
      );

      expect(container).toBeEmptyDOMElement();
      await waitFor(() => {
        expect(navigate).toHaveBeenCalledWith(expectedRoute, { replace: true });
      });
      expect(navigate).toHaveBeenCalledTimes(1);
    },
  );
});
