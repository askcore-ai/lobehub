import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/const/version', () => ({ isDesktop: false }));
vi.mock('@/store/user/selectors', () => ({ onboardingSelectors: { needsOnboarding: () => true } }));
import { useUserStateRedirect } from './useUserStateRedirect';

afterEach(() => vi.restoreAllMocks());
describe('registration before onboarding', () => {
  it('retains normal onboarding redirect outside the callback', () => {
    window.history.replaceState(null, '', '/');
    const { result } = renderHook(() => useUserStateRedirect());
    act(() => result.current({} as never));
    expect(window.location.pathname).toBe('/onboarding');
  });
  it('keeps the registration callback open until its own status resolves', () => {
    window.history.replaceState(null, '', '/askcore/workbench?protocol=registration');
    const { result } = renderHook(() => useUserStateRedirect());
    act(() => result.current({} as never));
    expect(window.location.pathname + window.location.search).toBe('/askcore/workbench?protocol=registration');
  });
});
