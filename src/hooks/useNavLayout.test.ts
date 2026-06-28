import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ASKCORE_ORGANIZATION_CHANGED_EVENT } from '@/business/client/AskCoreOrganization/events';
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

const organizationPayload = (active = true) => ({
  current: active
    ? {
        id: 'org-1',
        isActive: true,
        name: 'AskCore School',
        role: 'member',
        slug: 'askcore-school',
      }
    : null,
  organizations: [
    {
      id: 'org-1',
      isActive: active,
      name: 'AskCore School',
      role: 'member',
      slug: 'askcore-school',
    },
  ],
});

const mockNavFetch = ({
  organizationResponse = new Response(JSON.stringify(organizationPayload(true))),
  profileResponse = new Response(JSON.stringify(educationProfile('identity_required'))),
}: {
  organizationResponse?: Response;
  profileResponse?: Response;
} = {}) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/askcore/organizations') return organizationResponse.clone();
    if (url === '/api/askcore/workbench/me') return profileResponse.clone();
    return new Response(JSON.stringify({}), { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const workbenchItem = (items: ReturnType<typeof useNavLayout>['topNavItems']) =>
  items.find((item) => item.url === ASKCORE_WORKBENCH_PATH);

const identityClaimItem = (items: ReturnType<typeof useNavLayout>['topNavItems']) =>
  items.find((item) => item.url === '/organization?action=identity-claim');

beforeEach(() => {
  __resetAskCoreWorkbenchNavAccessForTest();
  vi.restoreAllMocks();
});

describe('useNavLayout AskCore workbench entry', () => {
  it('hides identity claim and workbench entries before an active organization is selected', async () => {
    const fetchMock = mockNavFetch({
      organizationResponse: new Response(JSON.stringify(organizationPayload(false))),
      profileResponse: new Response(JSON.stringify(educationProfile('teacher'))),
    });

    const { result } = renderHook(() => useNavLayout());

    await waitFor(() => expect(workbenchItem(result.current.topNavItems)?.hidden).toBe(true));
    await waitFor(() => expect(identityClaimItem(result.current.topNavItems)?.hidden).toBe(true));
    expect(fetchMock).not.toHaveBeenCalledWith('/api/askcore/workbench/me', expect.any(Object));
  });

  it('hides identity claim and workbench entries when the organization request fails', async () => {
    const fetchMock = mockNavFetch({
      organizationResponse: new Response(JSON.stringify({ detail: 'unavailable' }), {
        status: 503,
      }),
      profileResponse: new Response(JSON.stringify(educationProfile('teacher'))),
    });

    const { result } = renderHook(() => useNavLayout());

    await waitFor(() => expect(workbenchItem(result.current.topNavItems)?.hidden).toBe(true));
    await waitFor(() => expect(identityClaimItem(result.current.topNavItems)?.hidden).toBe(true));
    expect(fetchMock).not.toHaveBeenCalledWith('/api/askcore/workbench/me', expect.any(Object));
  });

  it('hides the teaching workbench entry while the active account still needs identity binding', async () => {
    mockNavFetch({
      profileResponse: new Response(JSON.stringify(educationProfile('identity_required'))),
    });

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
    mockNavFetch({
      profileResponse: new Response(JSON.stringify({ detail: 'missing identity' }), {
        status: 500,
      }),
    });

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
    mockNavFetch({
      profileResponse: new Response(JSON.stringify({ raw: '<html>signin</html>' })),
    });

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
    mockNavFetch({
      profileResponse: new Response(JSON.stringify(educationProfile('teacher'))),
    });

    const { result } = renderHook(() => useNavLayout());

    await waitFor(() =>
      expect(workbenchItem(result.current.topNavItems)).toMatchObject({
        hidden: false,
        title: 'tab.askcoreTeachingWorkbench',
      }),
    );
  });

  it('shows an equal learning workbench entry after a student identity is available', async () => {
    mockNavFetch({
      profileResponse: new Response(JSON.stringify(educationProfile('student_restricted'))),
    });

    const { result } = renderHook(() => useNavLayout());

    await waitFor(() =>
      expect(workbenchItem(result.current.topNavItems)).toMatchObject({
        hidden: false,
        title: 'tab.askcoreLearningWorkbench',
      }),
    );
  });

  it('refreshes AskCore nav access after the active organization changes', async () => {
    let hasActiveOrganization = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/askcore/organizations') {
        return new Response(JSON.stringify(organizationPayload(hasActiveOrganization)));
      }
      if (url === '/api/askcore/workbench/me') {
        return new Response(JSON.stringify(educationProfile('teacher')));
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useNavLayout());

    await waitFor(() => expect(workbenchItem(result.current.topNavItems)?.hidden).toBe(true));
    expect(fetchMock).not.toHaveBeenCalledWith('/api/askcore/workbench/me', expect.any(Object));

    hasActiveOrganization = true;
    act(() => {
      window.dispatchEvent(new Event(ASKCORE_ORGANIZATION_CHANGED_EVENT));
    });

    await waitFor(() =>
      expect(workbenchItem(result.current.topNavItems)).toMatchObject({
        hidden: false,
        title: 'tab.askcoreTeachingWorkbench',
      }),
    );
  });
});
