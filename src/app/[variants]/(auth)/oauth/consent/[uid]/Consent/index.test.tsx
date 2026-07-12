// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ConsentClient from './index';

vi.mock('@lobehub/ui', () => ({
  Block: ({ children }: any) => <div>{children}</div>,
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Flexbox: ({ children }: any) => <div>{children}</div>,
  Text: ({ children }: any) => <span>{children}</span>,
}));

vi.mock('@/features/AuthCard', () => ({
  default: ({ children, footer }: any) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));

vi.mock('../components/OAuthApplicationLogo', () => ({ default: () => <span>logo</span> }));

vi.mock('./BuiltinConsent', () => ({
  default: ({ uid }: { uid: string }) => <span data-testid="builtin-consent-uid">{uid}</span>,
}));

describe('ConsentClient', () => {
  afterEach(cleanup);

  it.each(['askcore-moodle', 'askcore-gibbon'])(
    'submits the active interaction uid for the built-in school client %s',
    (clientId) => {
      render(
        <ConsentClient
          clientId={clientId}
          clientMetadata={{ clientName: clientId }}
          scopes={['openid']}
          uid="interaction-uid-123"
        />,
      );

      expect(screen.getByTestId('builtin-consent-uid')).toHaveTextContent('interaction-uid-123');
    },
  );

  it('keeps explicit consent for a third-party client', () => {
    render(
      <ConsentClient
        clientId="third-party-client"
        clientMetadata={{ clientName: 'Third Party' }}
        scopes={['openid']}
        uid="interaction-uid-456"
      />,
    );

    expect(screen.queryByTestId('builtin-consent-uid')).not.toBeInTheDocument();
    expect(document.querySelector('input[name="uid"]')?.getAttribute('value')).toBe(
      'interaction-uid-456',
    );
  });
});
