import { render, screen } from '@testing-library/react';
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

vi.mock('@/features/NavHeader', () => ({
  default: () => <header />,
}));

vi.mock('@/features/Setting/SettingContainer', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('./componentMap', () => ({
  componentMap: {
    'school-affairs': () => <div data-testid="school-affairs" />,
    'school-plan': () => <div data-testid="school-plan" />,
  },
}));

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
    [SettingsTabs.SchoolAffairs, false, 'school-affairs'],
    [SettingsTabs.SchoolPlan, false, 'school-plan'],
    [SettingsTabs.SchoolAffairs, true, 'school-affairs'],
    [SettingsTabs.SchoolPlan, true, 'school-plan'],
  ])(
    'renders %s on mobile=%s while generic Business/OIDC features are disabled',
    (activeTab, mobile, testId) => {
      render(
        <ServerConfigProvider>
          <SettingsContent activeTab={activeTab} mobile={mobile} />
        </ServerConfigProvider>,
      );

      expect(screen.getByTestId(testId)).toBeVisible();
      expect(navigate).not.toHaveBeenCalled();
    },
  );
});
