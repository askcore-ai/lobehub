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
    renderRoute('/askcore/workbench?protocol=processing&launch=opaque-launch');

    expect(screen.getByText('processing-surface:opaque-launch')).toBeInTheDocument();
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
