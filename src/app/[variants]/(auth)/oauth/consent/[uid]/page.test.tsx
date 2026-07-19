// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import InteractionPage from './page';

const getInteractionDetails = vi.fn();
const getClientMetadata = vi.fn();

vi.mock('next/navigation', () => ({ notFound: vi.fn() }));

vi.mock('@/envs/auth', () => ({ authEnv: { ENABLE_OIDC: true } }));

vi.mock('@/libs/oidc-provider/config', () => ({
  ASKCORE_GIBBON_OIDC_CLIENT_ID: 'askcore-gibbon',
  ASKCORE_MOODLE_OIDC_CLIENT_ID: 'askcore-moodle',
  defaultClients: [
    { client_id: 'askcore-gibbon' },
    { client_id: 'askcore-moodle' },
    { client_id: 'third-party-client' },
  ],
}));

vi.mock('@/server/services/oidc', () => ({
  OIDCService: {
    initialize: async () => ({ getClientMetadata, getInteractionDetails }),
  },
}));

vi.mock('./ClientError', () => ({
  default: ({ error }: { error: { messageKey?: string } }) => (
    <span>{error.messageKey || 'client-error'}</span>
  ),
}));
vi.mock('./Consent', () => ({ default: () => <span>consent</span> }));
vi.mock('./Login', () => ({
  default: ({ autoSubmit, uid }: { autoSubmit?: boolean; uid: string }) => (
    <span data-testid="login-props">{`${uid}:${String(autoSubmit)}`}</span>
  ),
}));

describe('school OIDC interaction page', () => {
  beforeEach(() => {
    getClientMetadata.mockResolvedValue({ client_name: 'School source' });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each(['askcore-moodle', 'askcore-gibbon'])(
    'auto-submits a login prompt for %s',
    async (clientId) => {
      getInteractionDetails.mockResolvedValue({
        params: { client_id: clientId, scope: 'openid profile email' },
        prompt: { name: 'login' },
      });

      render(await InteractionPage({ params: Promise.resolve({ uid: 'interaction-login-123' }) }));

      expect(screen.getByTestId('login-props')).toHaveTextContent('interaction-login-123:true');
    },
  );

  it('does not auto-submit a login prompt for a third-party client', async () => {
    getInteractionDetails.mockResolvedValue({
      params: { client_id: 'third-party-client', scope: 'openid' },
      prompt: { name: 'login' },
    });

    render(await InteractionPage({ params: Promise.resolve({ uid: 'interaction-login-456' }) }));

    expect(screen.getByTestId('login-props')).toHaveTextContent('interaction-login-456:false');
  });

  it('fails closed when the OIDC interaction has expired', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getInteractionDetails.mockRejectedValue(new Error('interaction session not found'));

    render(await InteractionPage({ params: Promise.resolve({ uid: 'expired-interaction' }) }));

    expect(screen.getByText('consent.error.sessionInvalid.message')).toBeInTheDocument();
    expect(screen.queryByTestId('login-props')).not.toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
