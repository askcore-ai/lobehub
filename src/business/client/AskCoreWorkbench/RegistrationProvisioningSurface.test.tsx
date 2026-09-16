import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { sha256 } from 'js-sha256';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  status: vi.fn(), prepare: vi.fn(), recover: vi.fn(), refresh: vi.fn(), refetch: vi.fn(),
  session: { data: { user: { id: 'account-a' }, session: { id: 'session-a' } } as { user: { id: string }; session: { id: string } } | null, isPending: false, isRefetching: false },
}));
vi.mock('@/libs/better-auth/auth-client', () => ({ useSession: () => ({ ...mocks.session, refetch: mocks.refetch }) }));
vi.mock('@/business/client/BusinessGlobalProvider', () => ({ SCHOOL_SESSION_CHANNEL: 'askcore-school-session-v1' }));
vi.mock('@/store/user', () => ({ useUserStore: Object.assign((selector: (value: unknown) => unknown) => selector({ refreshUserState: mocks.refresh }), { getState: () => ({}) }) }));
vi.mock('@/store/user/selectors', () => ({ onboardingSelectors: { needsOnboarding: () => false } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@lobehub/ui/base-ui', () => ({ Button: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => <button disabled={disabled} onClick={onClick}>{children}</button> }));
vi.mock('./api', () => ({
  AskCoreWorkbenchApiError: class extends Error { constructor(message: string, public status: number) { super(message); } },
  fetchRegistrationStatus: mocks.status, prepareRegistrationIntent: mocks.prepare, recoverRegistration: mocks.recover,
}));

import { AskCoreWorkbenchApiError } from './api';
import { registrationSessionBinding } from './config';
import { RegistrationProvisioningSurface } from './RegistrationProvisioningSurface';

const choose = { state: 'awaiting_intent', action: 'choose_intent', retryAt: null, returnPath: '/school' };
const complete = { state: 'completed', action: 'continue', retryAt: null, returnPath: '/school' };
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
const Harness = () => <MemoryRouter initialEntries={['/askcore/workbench?protocol=registration']}>
  <Routes>
    <Route path="/askcore/workbench" element={<RegistrationProvisioningSurface />} />
    <Route path="/school" element={<div>school destination</div>} />
  </Routes>
</MemoryRouter>;

class Channel {
  static instances: Channel[] = [];
  onmessage?: (event: MessageEvent) => void;
  constructor() { Channel.instances.push(this); }
  close() { Channel.instances = Channel.instances.filter((value) => value !== this); }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = { data: { user: { id: 'account-a' }, session: { id: 'session-a' } }, isPending: false, isRefetching: false };
  mocks.status.mockResolvedValue(choose);
  mocks.prepare.mockResolvedValue({ handle: 'a'.repeat(64) });
  mocks.recover.mockResolvedValue({ ...choose, state: 'ready', action: 'wait' });
  mocks.refresh.mockResolvedValue(undefined);
  mocks.refetch.mockResolvedValue(undefined);
  window.sessionStorage.clear();
  Channel.instances = [];
  vi.stubGlobal('BroadcastChannel', Channel);
});
afterEach(() => vi.unstubAllGlobals());

describe('registration recovery surface', () => {
  it('continues after completion without acknowledging the backend job', async () => {
    mocks.status.mockResolvedValue(complete);
    render(<Harness />);
    expect(await screen.findByText('school destination')).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.recover).not.toHaveBeenCalled();
  });
  it('submits an explicit ordinary choice with the current session binding', async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByText('registration.action.createIdentity'));
    await waitFor(() => expect(mocks.recover).toHaveBeenCalledWith(
      registrationSessionBinding('account-a', 'session-a'), { intentHandle: 'a'.repeat(64) }, expect.any(AbortSignal),
    ));
    expect(mocks.prepare).toHaveBeenCalledWith({ kind: 'ordinary', returnPath: '/school' }, expect.any(AbortSignal));
  });
  it('does not submit a prepared A intent after the active account changes to B', async () => {
    const intent = deferred<{ handle: string }>();
    mocks.prepare.mockReturnValue(intent.promise);
    const view = render(<Harness />);
    fireEvent.click(await screen.findByText('registration.action.createIdentity'));
    await waitFor(() => expect(mocks.prepare).toHaveBeenCalledOnce());
    mocks.session.data = { user: { id: 'account-b' }, session: { id: 'session-b' } };
    view.rerender(<Harness />);
    await act(async () => intent.resolve({ handle: 'a'.repeat(64) }));
    expect(mocks.recover).not.toHaveBeenCalled();
    expect(screen.queryByText('school destination')).not.toBeInTheDocument();
  });
  it('ignores a completed recovery response from an earlier session of the same account', async () => {
    const response = deferred<typeof complete>();
    mocks.recover.mockReturnValue(response.promise);
    const view = render(<Harness />);
    fireEvent.click(await screen.findByText('registration.action.createIdentity'));
    await waitFor(() => expect(mocks.recover).toHaveBeenCalledOnce());
    mocks.session.data = { user: { id: 'account-a' }, session: { id: 'new-session-a' } };
    view.rerender(<Harness />);
    await act(async () => response.resolve(complete));
    expect(screen.queryByText('school destination')).not.toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it('blocks a late status response immediately on a cross-tab account switch', async () => {
    const response = deferred<typeof complete>();
    const refetch = deferred<void>();
    mocks.status.mockReturnValueOnce(response.promise);
    mocks.refetch.mockReturnValue(refetch.promise);
    render(<Harness />);
    await waitFor(() => expect(mocks.status).toHaveBeenCalledOnce());
    act(() => {
      for (const channel of Channel.instances) channel.onmessage?.({ data: {
        type: 'generation-changed', sessionState: 'stable', generationHash: sha256('account-b:session-b'),
      } } as MessageEvent);
    });
    await act(async () => response.resolve(complete));
    expect(mocks.status.mock.calls[0][0].aborted).toBe(true);
    expect(screen.queryByText('school destination')).not.toBeInTheDocument();
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });
  it('keeps temporary failures on the recovery page without turning them into login', async () => {
    mocks.status.mockRejectedValue(new AskCoreWorkbenchApiError('unavailable', 503));
    render(<Harness />);
    expect(await screen.findByText('registration.state.unavailable')).toBeInTheDocument();
    expect(screen.queryByText('registration.action.signIn')).not.toBeInTheDocument();
  });
  it('shows sign-in and ignores a late completion after logout', async () => {
    const response = deferred<typeof complete>();
    mocks.status.mockReturnValueOnce(response.promise);
    const view = render(<Harness />);
    await waitFor(() => expect(mocks.status).toHaveBeenCalledOnce());
    mocks.session.data = null;
    view.rerender(<Harness />);
    await act(async () => response.resolve(complete));
    expect(await screen.findByText('registration.action.signIn')).toBeInTheDocument();
    expect(screen.queryByText('school destination')).not.toBeInTheDocument();
  });
  it('refreshes after a session conflict without automatically repeating the write', async () => {
    mocks.recover.mockRejectedValueOnce(new AskCoreWorkbenchApiError('conflict', 409));
    render(<Harness />);
    fireEvent.click(await screen.findByText('registration.action.createIdentity'));
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.status.mock.calls.length).toBeGreaterThan(1));
    expect(mocks.recover).toHaveBeenCalledOnce();
  });
});
