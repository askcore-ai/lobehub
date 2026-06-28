import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ASKCORE_WORKBENCH_PATH } from '@/business/client/AskCoreWorkbench/config';

import { __resetAskCoreWorkbenchNavAccessForTest, useNavLayout } from './useNavLayout';

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

const educationProfile = (
  workbenchMode: 'identity_required' | 'student_managed' | 'student_restricted' | 'teacher',
) => ({
  active_persona: null,
  capabilities: {},
  default_persona: null,
  education_identities: [],
  org_composition: {},
  workbench_mode: workbenchMode,
});

const workbenchItem = (items: ReturnType<typeof useNavLayout>['topNavItems']) =>
  items.find((item) => item.url === ASKCORE_WORKBENCH_PATH);

const identityClaimItem = (items: ReturnType<typeof useNavLayout>['topNavItems']) =>
  items.find((item) => item.url === '/organization?action=identity-claim');

beforeEach(() => {
  __resetAskCoreWorkbenchNavAccessForTest();
  vi.restoreAllMocks();
});

describe('useNavLayout AskCore workbench entry', () => {
  it('hides the teaching workbench entry while the active account still needs identity binding', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(educationProfile('identity_required')))),
    );

    const { result } = renderHook(() => useNavLayout());

    await waitFor(() => expect(workbenchItem(result.current.topNavItems)?.hidden).toBe(true));
    await waitFor(() =>
      expect(identityClaimItem(result.current.topNavItems)).toMatchObject({
        hidden: false,
        title: 'tab.askcoreIdentityClaim',
      }),
    );
  });

  it('does not expose the teaching workbench when the identity profile request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ detail: 'missing identity' }), { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useNavLayout());

    await waitFor(() => expect(workbenchItem(result.current.topNavItems)?.hidden).toBe(true));
    await waitFor(() =>
      expect(identityClaimItem(result.current.topNavItems)).toMatchObject({
        hidden: false,
        title: 'tab.askcoreIdentityClaim',
      }),
    );
  });

  it('does not expose the teaching workbench when the identity profile payload is invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ raw: '<html>signin</html>' }))),
    );

    const { result } = renderHook(() => useNavLayout());

    await waitFor(() => expect(workbenchItem(result.current.topNavItems)?.hidden).toBe(true));
    await waitFor(() =>
      expect(identityClaimItem(result.current.topNavItems)).toMatchObject({
        hidden: false,
        title: 'tab.askcoreIdentityClaim',
      }),
    );
  });

  it('shows the teaching workbench entry after a teacher identity is available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(educationProfile('teacher')))),
    );

    const { result } = renderHook(() => useNavLayout());

    await waitFor(() =>
      expect(workbenchItem(result.current.topNavItems)).toMatchObject({
        hidden: false,
        title: 'tab.askcoreTeachingWorkbench',
      }),
    );
  });

  it('shows an equal learning workbench entry after a student identity is available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(educationProfile('student_restricted')))),
    );

    const { result } = renderHook(() => useNavLayout());

    await waitFor(() =>
      expect(workbenchItem(result.current.topNavItems)).toMatchObject({
        hidden: false,
        title: 'tab.askcoreLearningWorkbench',
      }),
    );
  });
});
