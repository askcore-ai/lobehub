import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AskCoreProtocolRoute, askCoreProtocolRouteMode } from './ProtocolRoute';

vi.mock('./ProtocolProcessingSurface', () => ({
  ProtocolProcessingSurface: ({ launchScope }: { launchScope: string }) => (
    <div>processing-surface:{launchScope}</div>
  ),
}));

vi.mock('./ProtocolIdentityLinkSurface', () => ({
  ProtocolIdentityLinkSurface: ({ invitationToken }: { invitationToken?: string }) => (
    <div>identity-surface:{invitationToken}</div>
  ),
}));

const renderRoute = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route element={<AskCoreProtocolRoute />} path="/askcore/workbench" />
        <Route element={<div>home</div>} path="/" />
      </Routes>
    </MemoryRouter>,
  );

describe('AskCoreProtocolRoute', () => {
  it('binds the opaque per-tab launch scope to the processing surface', () => {
    const launchScope = '0123456789abcdef0123456789abcdef';
    renderRoute(`/askcore/workbench?protocol=processing&launch=${launchScope}`);

    expect(screen.getByText(`processing-surface:${launchScope}`)).toBeInTheDocument();
  });

  it('rejects a processing route without a valid tab scope', () => {
    renderRoute('/askcore/workbench?protocol=processing&launch=shared-cookie');

    expect(screen.getByText('home')).toBeInTheDocument();
  });

  it('passes the one-time identity token through on desktop and mobile routes', () => {
    renderRoute('/askcore/workbench?protocol=identity-link&token=opaque-invitation');

    expect(screen.getByText('identity-surface:opaque-invitation')).toBeInTheDocument();
  });

  it('rejects non-P130 protocol modes', () => {
    expect(askCoreProtocolRouteMode('?protocol=deep-linking')).toBeNull();
    renderRoute('/askcore/workbench?protocol=deep-linking&token=not-consumed');

    expect(screen.getByText('home')).toBeInTheDocument();
  });
});
