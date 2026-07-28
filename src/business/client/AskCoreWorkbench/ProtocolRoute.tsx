'use client';

import { memo, useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { ProtocolIdentityLinkSurface } from './ProtocolIdentityLinkSurface';
import { ProtocolProcessingSurface } from './ProtocolProcessingSurface';

export type AskCoreProtocolRouteMode = 'identity-link' | 'processing';
const PROCESSING_LAUNCH_SCOPE_PATTERN = /^[a-f0-9]{32}$/;

export const askCoreProtocolRouteMode = (search: string): AskCoreProtocolRouteMode | null => {
  const mode = new URLSearchParams(search).get('protocol');
  return mode === 'processing' || mode === 'identity-link' ? mode : null;
};

export const AskCoreProtocolRoute = memo(() => {
  const location = useLocation();
  const mode = useMemo(() => askCoreProtocolRouteMode(location.search), [location.search]);

  if (mode === 'processing') {
    const launchScope = new URLSearchParams(location.search).get('launch') || '';
    if (!PROCESSING_LAUNCH_SCOPE_PATTERN.test(launchScope)) return <Navigate replace to="/" />;
    return <ProtocolProcessingSurface launchScope={launchScope} />;
  }
  if (mode === 'identity-link') {
    const invitationToken = new URLSearchParams(location.search).get('token') || undefined;
    return <ProtocolIdentityLinkSurface invitationToken={invitationToken} />;
  }
  return <Navigate replace to="/" />;
});

AskCoreProtocolRoute.displayName = 'AskCoreProtocolRoute';
