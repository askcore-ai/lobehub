'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import useSWR from 'swr';

import {
  fetchSchoolPortalManifestForGeneration,
  fetchSchoolSourceSessionForGeneration,
  gibbonSessionProbeReady,
  invalidateSchoolPortalBootstrap,
  readSchoolPortalBootstrapSnapshot,
  recoverSchoolSourceSession,
  schoolPortalBootstrapExpiresAt,
  schoolPortalManifestCacheKey,
  schoolPortalManifestScope,
  stableSchoolSessionGeneration,
  schoolSourceSessionCacheKey,
  sourceSessionReady,
} from '@/business/client/AskCoreSchoolPortal/api';
import { useSession } from '@/libs/better-auth/auth-client';

const WARMUP_TIMEOUT_MS = 30_000;

type WarmupStage = 'complete' | 'gibbon' | 'moodle' | 'stopped' | null;

const SchoolSessionWarmup = () => {
  const { pathname } = useLocation();
  const {
    data: accountSession,
    isPending: accountSessionPending,
    isRefetching: accountSessionRefetching,
  } = useSession();
  const sessionGeneration = stableSchoolSessionGeneration(accountSession, {
    isPending: accountSessionPending,
    isRefetching: accountSessionRefetching,
  });
  const schoolRouteActive = pathname === '/school' || pathname.startsWith('/school/');
  const identityLinkPending =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('protocol') === 'identity-link';
  const enabled = !!sessionGeneration && !identityLinkPending && !schoolRouteActive;
  const bootstrapSnapshot = sessionGeneration
    ? readSchoolPortalBootstrapSnapshot(sessionGeneration)
    : undefined;
  const bootstrapExpiresAt = schoolPortalBootstrapExpiresAt(bootstrapSnapshot);
  const [schoolLifecycleEpoch, setSchoolLifecycleEpoch] = useState(0);

  const {
    data: portal,
    error: portalError,
    isValidating: portalIsValidating,
    mutate: mutatePortal,
  } = useSWR(
    enabled
      ? schoolPortalManifestCacheKey(sessionGeneration, schoolPortalManifestScope(pathname))
      : null,
    ([, generation]) => fetchSchoolPortalManifestForGeneration(generation),
    {
      fallbackData: bootstrapSnapshot?.portal,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
  const roleKey = enabled ? schoolSourceSessionCacheKey(sessionGeneration) : null;
  const {
    data: liveRole,
    error: roleError,
    isValidating: roleIsValidating,
    mutate: mutateRole,
  } = useSWR(
    roleKey,
    ([url, generation]) => fetchSchoolSourceSessionForGeneration(url, generation),
    {
      fallbackData: bootstrapSnapshot?.sourceSession,
      revalidateOnFocus: true,
      shouldRetryOnError: false,
    },
  );

  const refreshSchoolLifecycle = useCallback(() => {
    invalidateSchoolPortalBootstrap();
    setSchoolLifecycleEpoch((current) => current + 1);
    return Promise.allSettled([mutatePortal(), mutateRole()]);
  }, [mutatePortal, mutateRole]);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted || !enabled) return;
      void refreshSchoolLifecycle();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [enabled, refreshSchoolLifecycle]);
  useEffect(() => {
    if (!enabled) return;
    if (!bootstrapExpiresAt) return;
    const timer = window.setTimeout(
      () => void refreshSchoolLifecycle(),
      Math.max(0, bootstrapExpiresAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [bootstrapExpiresAt, enabled, refreshSchoolLifecycle]);
  useEffect(() => {
    if (!accountSessionPending && !sessionGeneration) invalidateSchoolPortalBootstrap();
  }, [accountSessionPending, sessionGeneration]);
  const exactBootstrapPair =
    bootstrapSnapshot?.portal === portal && bootstrapSnapshot?.sourceSession === liveRole;
  const pairTrusted =
    !portalError &&
    !roleError &&
    ((!portalIsValidating && !roleIsValidating) || exactBootstrapPair);
  const trustedLiveRole = pairTrusted ? liveRole : undefined;
  const recoveryPortal =
    !portalError && (!portalIsValidating || exactBootstrapPair) ? portal : undefined;
  const destinations = useMemo(
    () =>
      recoveryPortal?.state === 'ready' ? (recoveryPortal.schools[0]?.destinations ?? []) : [],
    [recoveryPortal],
  );
  const gibbonWarmup = useMemo(
    () => destinations.find((destination) => destination.key === 'school-services'),
    [destinations],
  );
  const moodleWarmup = useMemo(
    () => destinations.find((destination) => destination.key === 'teaching'),
    [destinations],
  );
  const flowKey = `${sessionGeneration || ''}:${schoolLifecycleEpoch}:${
    gibbonWarmup?.session_launch_url || ''
  }:${moodleWarmup?.session_launch_url || ''}`;
  const [stage, setStage] = useState<WarmupStage>(null);
  const gibbonProbeInFlight = useRef(false);
  const gibbonRoleConfirmedFor = useRef<string | null>(null);
  const activeFlowKey = useRef(flowKey);
  activeFlowKey.current = flowKey;

  useEffect(() => {
    gibbonProbeInFlight.current = false;
    gibbonRoleConfirmedFor.current = null;
    setStage(null);
  }, [flowKey]);

  useEffect(() => {
    if (!enabled || recoveryPortal?.state !== 'ready') return;
    if (trustedLiveRole?.authenticated) {
      setStage((current) => {
        if (current === 'complete' || current === 'gibbon' || current === 'stopped') return current;
        return moodleWarmup ? 'moodle' : 'complete';
      });
      return;
    }
    if ((roleError || liveRole?.authenticated === false) && gibbonWarmup) {
      setStage((current) => current ?? 'gibbon');
    }
  }, [enabled, gibbonWarmup, trustedLiveRole, moodleWarmup, recoveryPortal?.state, roleError]);

  useEffect(() => {
    if (!stage) return;
    const timer = window.setTimeout(() => setStage('stopped'), WARMUP_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [flowKey, stage]);

  if (
    !enabled ||
    recoveryPortal?.state !== 'ready' ||
    !stage ||
    stage === 'complete' ||
    stage === 'stopped'
  ) {
    return null;
  }
  const warmup = stage === 'gibbon' ? gibbonWarmup : moodleWarmup;
  if (!warmup) return null;

  return (
    <iframe
      hidden
      data-askcore-school-session={warmup.key}
      key={`${flowKey}:${stage}`}
      src={warmup.session_launch_url}
      title={`askcore-school-session-${warmup.key}`}
      onLoad={(event) => {
        if (stage === 'moodle') {
          if (sourceSessionReady(event.currentTarget)) setStage('complete');
          return;
        }
        if (!gibbonSessionProbeReady(event.currentTarget)) return;
        if (gibbonProbeInFlight.current || gibbonRoleConfirmedFor.current === flowKey) return;
        const expectedFlowKey = flowKey;
        gibbonProbeInFlight.current = true;
        invalidateSchoolPortalBootstrap();
        void recoverSchoolSourceSession(() => mutateRole(), {
          isCurrent: () => activeFlowKey.current === expectedFlowKey,
        })
          .then(async (sourceSession) => {
            if (!sourceSession?.authenticated || activeFlowKey.current !== expectedFlowKey) return;
            await mutatePortal();
            if (activeFlowKey.current !== expectedFlowKey) return;
            gibbonRoleConfirmedFor.current = flowKey;
            setStage(moodleWarmup ? 'moodle' : 'complete');
          })
          .catch(() => {})
          .finally(() => {
            if (activeFlowKey.current === expectedFlowKey) {
              gibbonProbeInFlight.current = false;
            }
          });
      }}
    />
  );
};

export default function BusinessGlobalProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SchoolSessionWarmup />
    </>
  );
}
