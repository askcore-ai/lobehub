// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { setSchoolHandoffSessionState, useSession } = vi.hoisted(() => ({
  setSchoolHandoffSessionState: vi.fn(),
  useSession: vi.fn(),
}));
vi.mock('@/libs/better-auth/auth-client', () => ({ useSession }));
vi.mock('@/business/client/AskCoreSchoolPortal/handoffClient', () => ({
  setSchoolHandoffSessionState,
}));

const messages: unknown[] = [];
class FakeBroadcastChannel {
  close = vi.fn();
  postMessage = vi.fn((message: unknown) => messages.push(message));
}

describe('P140 school session generation notifier', () => {
  beforeEach(() => {
    messages.length = 0;
    setSchoolHandoffSessionState.mockReset();
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('broadcasts account-generation changes without rendering source frames', async () => {
    let session = { session: { id: 'session-a' }, user: { id: 'account-a' } };
    useSession.mockImplementation(() => ({ data: session, isPending: false, isRefetching: false }));
    const { default: Provider } = await import('./BusinessGlobalProvider');
    const view = render(<Provider><span>child</span></Provider>);
    expect(screen.getByText('child')).toBeVisible();
    await waitFor(() => expect(messages).toHaveLength(1));
    expect(messages[0]).toMatchObject({
      sessionState: 'stable',
      type: 'generation-changed',
    });
    expect(setSchoolHandoffSessionState).toHaveBeenCalledWith(
      'stable',
      expect.any(String),
    );
    expect(view.container.querySelector('iframe')).toBeNull();

    session = { session: { id: 'session-b' }, user: { id: 'account-b' } };
    view.rerender(<Provider><span>child</span></Provider>);
    await waitFor(() => expect(messages).toHaveLength(2));
    expect(JSON.stringify(messages)).not.toContain('account-a');
    expect(JSON.stringify(messages)).not.toContain('session-a');
  });

  it('broadcasts logout as a null generation and keeps no persistent state', async () => {
    let session: null | { session: { id: string }; user: { id: string } } = {
      session: { id: 'session-a' },
      user: { id: 'account-a' },
    };
    useSession.mockImplementation(() => ({ data: session, isPending: false, isRefetching: false }));
    const { default: Provider } = await import('./BusinessGlobalProvider');
    const view = render(<Provider><span>child</span></Provider>);
    await waitFor(() => expect(messages).toHaveLength(1));
    messages.length = 0;
    session = null;
    view.rerender(<Provider><span>child</span></Provider>);
    await waitFor(() => expect(messages).toEqual([
      { generationHash: null, sessionState: 'signed-out', type: 'generation-changed' },
    ]));
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('broadcasts fail-closed invalidation before a refetch resolves to another account', async () => {
    let session = { session: { id: 'session-a' }, user: { id: 'account-a' } };
    let isRefetching = false;
    useSession.mockImplementation(() => ({
      data: session,
      isPending: false,
      isRefetching,
    }));
    const { default: Provider } = await import('./BusinessGlobalProvider');
    const view = render(<Provider><span>child</span></Provider>);
    await waitFor(() => expect(messages).toHaveLength(1));

    isRefetching = true;
    view.rerender(<Provider><span>child</span></Provider>);
    await waitFor(() =>
      expect(messages.at(-1)).toEqual({
        generationHash: null,
        sessionState: 'unstable',
        type: 'generation-changed',
      }),
    );
    expect(setSchoolHandoffSessionState).toHaveBeenLastCalledWith('unstable', null);

    session = { session: { id: 'session-b' }, user: { id: 'account-b' } };
    isRefetching = false;
    view.rerender(<Provider><span>child</span></Provider>);
    await waitFor(() => expect(messages).toHaveLength(3));
    expect(messages.at(-1)).toMatchObject({ sessionState: 'stable' });
    expect(JSON.stringify(messages)).not.toContain('account-a');
    expect(JSON.stringify(messages)).not.toContain('account-b');
  });
});
